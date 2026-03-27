package com.ietires.scanneragent

import android.app.*
import android.app.admin.DevicePolicyManager
import android.content.*
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.*
import android.util.Log
import org.eclipse.paho.android.service.MqttAndroidClient
import org.eclipse.paho.client.mqttv3.*
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

/**
 * Foreground service that maintains MQTT connection to AWS IoT Core.
 * Publishes telemetry every 5 minutes and listens for remote commands.
 */
class MqttService : Service() {

    companion object {
        const val TAG = "ScannerAgent"
        const val NOTIFICATION_ID = 1
        const val CHANNEL_ID = "scanner_agent_channel"
        const val TELEMETRY_INTERVAL_MS = 5 * 60 * 1000L // 5 minutes
    }

    private var mqttClient: MqttAndroidClient? = null
    private val handler = Handler(Looper.getMainLooper())
    private var thingName: String = ""
    private var iotEndpoint: String = ""

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."))
        loadConfigAndConnect()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY // Restart if killed
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        mqttClient?.disconnect()
        super.onDestroy()
    }

    private fun loadConfigAndConnect() {
        val configFile = File(filesDir, "iot_config.json")
        if (!configFile.exists()) {
            Log.e(TAG, "IoT config not found. Scanner not provisioned.")
            updateNotification("Not provisioned")
            return
        }

        val config = JSONObject(configFile.readText())
        thingName = config.getString("thingName")
        iotEndpoint = config.getString("iotEndpoint")

        connectMqtt()
    }

    private fun connectMqtt() {
        val serverUri = "ssl://$iotEndpoint:8883"
        mqttClient = MqttAndroidClient(this, serverUri, thingName, MemoryPersistence())

        mqttClient?.setCallback(object : MqttCallbackExtended {
            override fun connectComplete(reconnect: Boolean, serverURI: String) {
                Log.i(TAG, "Connected to IoT Core (reconnect=$reconnect)")
                updateNotification("Connected")
                subscribeToCommands()
                startTelemetryLoop()
            }

            override fun connectionLost(cause: Throwable?) {
                Log.w(TAG, "Connection lost: ${cause?.message}")
                updateNotification("Reconnecting...")
                // MqttAndroidClient handles auto-reconnect
            }

            override fun messageArrived(topic: String, message: MqttMessage) {
                handleCommand(topic, message)
            }

            override fun deliveryComplete(token: IMqttDeliveryToken) {}
        })

        val options = MqttConnectOptions().apply {
            isAutomaticReconnect = true
            isCleanSession = true
            connectionTimeout = 30
            keepAliveInterval = 60
            socketFactory = createSslSocketFactory()
        }

        try {
            mqttClient?.connect(options)
        } catch (e: Exception) {
            Log.e(TAG, "MQTT connect failed: ${e.message}")
            updateNotification("Connection failed")
        }
    }

    private fun createSslSocketFactory(): javax.net.ssl.SSLSocketFactory {
        val certFile = File(filesDir, "certificate.pem")
        val keyFile = File(filesDir, "private.key")
        val caFile = File(filesDir, "root-ca.pem")

        // Load CA certificate
        val cf = CertificateFactory.getInstance("X.509")
        val caCert = cf.generateCertificate(caFile.inputStream())
        val trustStore = KeyStore.getInstance(KeyStore.getDefaultType())
        trustStore.load(null)
        trustStore.setCertificateEntry("ca", caCert)
        val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        tmf.init(trustStore)

        // Load client certificate + private key
        val clientCert = cf.generateCertificate(certFile.inputStream())
        val keyStore = KeyStore.getInstance("PKCS12")
        keyStore.load(null)
        keyStore.setCertificateEntry("client", clientCert)
        // Note: In production, use BouncyCastle to load PEM private key into keystore
        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(keyStore, CharArray(0))

        val sslContext = SSLContext.getInstance("TLSv1.2")
        sslContext.init(kmf.keyManagers, tmf.trustManagers, null)
        return sslContext.socketFactory
    }

    private fun subscribeToCommands() {
        val topic = "cmd/scanners/$thingName/#"
        mqttClient?.subscribe(topic, 1) { _, _ ->
            Log.i(TAG, "Subscribed to $topic")
        }
    }

    // ============ TELEMETRY ============

    private fun startTelemetryLoop() {
        handler.removeCallbacksAndMessages(null)
        publishTelemetry()
        handler.postDelayed(object : Runnable {
            override fun run() {
                publishTelemetry()
                handler.postDelayed(this, TELEMETRY_INTERVAL_MS)
            }
        }, TELEMETRY_INTERVAL_MS)
    }

    private fun publishTelemetry() {
        val telemetry = JSONObject().apply {
            put("battery", getBatteryLevel())
            put("wifiSignal", getWifiSignal())
            put("gps", getGpsLocation())
            put("apps", getInstalledAppVersions())
            put("agentVersion", BuildConfig.VERSION_NAME)
            put("androidVersion", Build.VERSION.RELEASE)
            put("isLocked", false) // TODO: check actual lock state
            put("timestamp", System.currentTimeMillis() / 1000)
        }

        val topic = "dt/scanners/$thingName/telemetry"
        try {
            mqttClient?.publish(topic, MqttMessage(telemetry.toString().toByteArray()).apply {
                qos = 0
            })
            Log.d(TAG, "Telemetry published")
        } catch (e: Exception) {
            Log.e(TAG, "Telemetry publish failed: ${e.message}")
        }

        // Also update device shadow
        val shadow = JSONObject().apply {
            put("state", JSONObject().apply {
                put("reported", telemetry)
            })
        }
        try {
            mqttClient?.publish(
                "\$aws/things/$thingName/shadow/update",
                MqttMessage(shadow.toString().toByteArray()).apply { qos = 0 }
            )
        } catch (e: Exception) {
            Log.e(TAG, "Shadow update failed: ${e.message}")
        }
    }

    private fun getBatteryLevel(): Int {
        val bm = getSystemService(BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun getWifiSignal(): Int {
        val wm = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
        return wm.connectionInfo.rssi
    }

    private fun getGpsLocation(): JSONObject {
        val result = JSONObject()
        try {
            val lm = getSystemService(LOCATION_SERVICE) as LocationManager
            val loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (loc != null) {
                result.put("lat", loc.latitude)
                result.put("lng", loc.longitude)
                result.put("accuracy", loc.accuracy)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Location permission not granted")
        }
        return result
    }

    private fun getInstalledAppVersions(): JSONObject {
        val apps = JSONObject()
        val pm = packageManager
        try {
            apps.put("tireTrack", pm.getPackageInfo("com.ietires.tiretrack", 0).versionName)
        } catch (e: Exception) { /* not installed */ }
        try {
            apps.put("rtLocator", pm.getPackageInfo("com.rtsystems.rtlmobile", 0).versionName)
        } catch (e: Exception) { /* not installed */ }
        apps.put("scannerAgent", BuildConfig.VERSION_NAME)
        return apps
    }

    // ============ COMMAND HANDLING ============

    private fun handleCommand(topic: String, message: MqttMessage) {
        val payload = JSONObject(String(message.payload))
        val command = payload.optString("command", topic.substringAfterLast("/"))
        Log.i(TAG, "Received command: $command")

        when (command) {
            "lock" -> lockDevice()
            "unlock" -> unlockDevice()
            "wipe" -> wipeDevice()
            "restart" -> restartDevice()
            "install_apk" -> installApk(payload.optJSONObject("payload"))
            "push_config" -> pushConfig(payload.optJSONObject("payload"))
            "update_pin" -> updatePin(payload.optJSONObject("payload"))
        }

        // Acknowledge command
        val ack = JSONObject().apply {
            put("command", command)
            put("status", "acknowledged")
            put("timestamp", System.currentTimeMillis() / 1000)
        }
        mqttClient?.publish(
            "cmd/scanners/$thingName/ack",
            MqttMessage(ack.toString().toByteArray()).apply { qos = 1 }
        )
    }

    private fun lockDevice() {
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, DeviceAdminReceiver::class.java)
        if (dpm.isAdminActive(admin)) {
            dpm.lockNow()
            Log.i(TAG, "Device locked")
        } else {
            Log.w(TAG, "Device admin not active, cannot lock")
        }
    }

    private fun unlockDevice() {
        // Unlock requires user interaction on most Android versions
        Log.i(TAG, "Unlock requested — user must unlock manually")
    }

    private fun wipeDevice() {
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, DeviceAdminReceiver::class.java)
        if (dpm.isAdminActive(admin)) {
            Log.w(TAG, "FACTORY RESET initiated!")
            dpm.wipeData(0)
        } else {
            Log.w(TAG, "Device admin not active, cannot wipe")
        }
    }

    private fun restartDevice() {
        // Requires device owner or root
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            pm.reboot("scanner-mdm-restart")
        } catch (e: Exception) {
            Log.w(TAG, "Reboot failed (may need device owner): ${e.message}")
        }
    }

    private fun installApk(payload: JSONObject?) {
        val downloadUrl = payload?.optString("downloadUrl") ?: return
        Log.i(TAG, "Downloading APK from: $downloadUrl")
        // TODO: Download APK, trigger install via Intent or PackageInstaller
    }

    private fun pushConfig(payload: JSONObject?) {
        val xmlContent = payload?.optString("configXml") ?: return
        val configDir = File(Environment.getExternalStorageDirectory(), "My Documents")
        configDir.mkdirs()
        File(configDir, "rtlconfig.xml").writeText(xmlContent)
        Log.i(TAG, "RT config pushed")
    }

    private fun updatePin(payload: JSONObject?) {
        val newPin = payload?.optString("pin") ?: return
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, DeviceAdminReceiver::class.java)
        if (dpm.isAdminActive(admin)) {
            dpm.resetPassword(newPin, 0)
            Log.i(TAG, "PIN updated")
        }
    }

    // ============ NOTIFICATIONS ============

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Scanner Agent", NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Scanner MDM agent status" }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(status: String): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("IE Scanner Agent")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(status: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(status))
    }
}
