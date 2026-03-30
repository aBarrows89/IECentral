package com.ietires.scanneragent

import android.app.Application
import android.content.Intent
import android.os.Build
import android.util.Log
import java.io.File

class ScannerAgentApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Log.i(MqttService.TAG, "Scanner Agent app started")

        // Only start MQTT service if provisioned (config exists)
        if (File(filesDir, "iot_config.json").exists()) {
            val intent = Intent(this, MqttService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } else {
            Log.i(MqttService.TAG, "Not provisioned — waiting for setup")
        }
    }
}
