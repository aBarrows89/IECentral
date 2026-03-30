package com.ietires.scanneragent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Starts the MQTT service when the device boots or the app is updated.
 * Only starts if the scanner is provisioned (iot_config.json exists).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            if (!File(context.filesDir, "iot_config.json").exists()) {
                Log.i(MqttService.TAG, "Boot/update received but not provisioned — skipping")
                return
            }
            Log.i(MqttService.TAG, "Boot/update received, starting MQTT service")
            val serviceIntent = Intent(context, MqttService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
