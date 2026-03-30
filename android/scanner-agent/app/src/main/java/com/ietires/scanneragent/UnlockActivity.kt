package com.ietires.scanneragent

import android.app.Activity
import android.app.KeyguardManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager

/**
 * Transparent Activity that dismisses the keyguard and keeps the screen on.
 * Launched by MqttService when an unlock command is received.
 * Finishes itself after a short delay.
 */
class UnlockActivity : Activity() {

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Window flags to show over lock screen and keep screen on
        window.addFlags(
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        // API 27+ method
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
            km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() {
                    Log.i(MqttService.TAG, "Keyguard dismissed successfully")
                }
                override fun onDismissError() {
                    Log.w(MqttService.TAG, "Keyguard dismiss error")
                }
                override fun onDismissCancelled() {
                    Log.w(MqttService.TAG, "Keyguard dismiss cancelled")
                }
            })
        }

        Log.i(MqttService.TAG, "UnlockActivity created — screen should be on and unlocked")

        // Finish after 3 seconds — screen stays on from the wake lock in MqttService
        window.decorView.postDelayed({ finish() }, 3000)
    }
}
