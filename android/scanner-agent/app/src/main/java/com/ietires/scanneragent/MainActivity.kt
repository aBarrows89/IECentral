package com.ietires.scanneragent

import android.app.Activity
import android.os.Bundle
import android.widget.TextView
import android.widget.LinearLayout
import android.view.Gravity

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }
        layout.addView(TextView(this).apply {
            text = "IE Scanner Agent"
            textSize = 20f
            gravity = Gravity.CENTER
        })
        layout.addView(TextView(this).apply {
            text = "v${BuildConfig.VERSION_NAME}\nAgent is running in the background."
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 0)
        })
        setContentView(layout)
    }
}
