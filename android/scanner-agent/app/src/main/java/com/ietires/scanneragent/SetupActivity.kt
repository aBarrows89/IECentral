package com.ietires.scanneragent

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.*
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Setup screen shown when the scanner agent has no IoT config.
 * User enters a 6-character claim code from IECentral to provision the scanner.
 */
class SetupActivity : Activity() {

    companion object {
        const val TAG = "ScannerSetup"
    }

    private lateinit var codeInput: EditText
    private lateinit var submitBtn: Button
    private lateinit var statusText: TextView
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(32), dp(64), dp(32), dp(32))
            setBackgroundColor(Color.WHITE)
        }

        // Title
        layout.addView(TextView(this).apply {
            text = "IE Scanner Agent"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            setTextColor(Color.parseColor("#1e293b"))
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })

        // Subtitle
        layout.addView(TextView(this).apply {
            text = "Setup"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, dp(32))
        })

        // Instructions
        layout.addView(TextView(this).apply {
            text = "Enter the provisioning code\nfrom IECentral"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setTextColor(Color.parseColor("#475569"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(24))
        })

        // Code input
        codeInput = EditText(this).apply {
            hint = "XXXXXX"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            filters = arrayOf(InputFilter.LengthFilter(6), InputFilter.AllCaps())
            setTextColor(Color.parseColor("#0891b2"))
            setHintTextColor(Color.parseColor("#cbd5e1"))
            letterSpacing = 0.3f
            setPadding(dp(16), dp(16), dp(16), dp(16))
            setBackgroundColor(Color.parseColor("#f1f5f9"))
        }
        val inputParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { setMargins(0, 0, 0, dp(16)) }
        layout.addView(codeInput, inputParams)

        // Submit button
        submitBtn = Button(this).apply {
            text = "Submit"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#0891b2"))
            setPadding(dp(16), dp(14), dp(16), dp(14))
            isAllCaps = false
        }
        submitBtn.setOnClickListener { handleSubmit() }
        val btnParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { setMargins(0, 0, 0, dp(16)) }
        layout.addView(submitBtn, btnParams)

        // Status text
        statusText = TextView(this).apply {
            text = ""
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
        }
        layout.addView(statusText)

        setContentView(layout)
    }

    private fun handleSubmit() {
        val code = codeInput.text.toString().trim().uppercase()
        if (code.length != 6) {
            statusText.setTextColor(Color.parseColor("#ef4444"))
            statusText.text = "Enter a 6-character code"
            return
        }

        submitBtn.isEnabled = false
        codeInput.isEnabled = false
        statusText.setTextColor(Color.parseColor("#64748b"))
        statusText.text = "Provisioning..."

        executor.execute {
            try {
                val result = claimProvision(code)
                if (result.has("error")) {
                    runOnUiThread {
                        statusText.setTextColor(Color.parseColor("#ef4444"))
                        statusText.text = result.getString("error")
                        submitBtn.isEnabled = true
                        codeInput.isEnabled = true
                    }
                    return@execute
                }

                // Save certs and config
                saveProvisionData(result)

                runOnUiThread {
                    statusText.setTextColor(Color.parseColor("#10b981"))
                    statusText.text = "Provisioned! Starting agent..."
                    submitBtn.visibility = View.GONE
                    codeInput.isEnabled = false
                }

                // Start the MQTT service
                Thread.sleep(1000)
                runOnUiThread {
                    val serviceIntent = Intent(this@SetupActivity, MqttService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent)
                    } else {
                        startService(serviceIntent)
                    }
                    finish()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Claim failed: ${e.message}", e)
                runOnUiThread {
                    statusText.setTextColor(Color.parseColor("#ef4444"))
                    statusText.text = "Error: ${e.message}"
                    submitBtn.isEnabled = true
                    codeInput.isEnabled = true
                }
            }
        }
    }

    private fun claimProvision(code: String): JSONObject {
        val url = URL(BuildConfig.CLAIM_URL)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        conn.connectTimeout = 15000
        conn.readTimeout = 15000

        val body = JSONObject().apply { put("code", code) }
        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

        val responseCode = conn.responseCode
        val responseBody = if (responseCode in 200..299) {
            conn.inputStream.bufferedReader().readText()
        } else {
            conn.errorStream?.bufferedReader()?.readText() ?: """{"error": "HTTP $responseCode"}"""
        }
        conn.disconnect()

        return JSONObject(responseBody)
    }

    private fun saveProvisionData(data: JSONObject) {
        // Save certificate
        File(filesDir, "certificate.pem").writeText(data.getString("certificatePem"))
        Log.i(TAG, "Saved certificate.pem")

        // Save private key
        File(filesDir, "private.key").writeText(data.getString("privateKey"))
        Log.i(TAG, "Saved private.key")

        // Save Root CA from bundled asset
        val caBytes = assets.open("AmazonRootCA1.pem").readBytes()
        File(filesDir, "root-ca.pem").writeBytes(caBytes)
        Log.i(TAG, "Saved root-ca.pem")

        // Save IoT config
        val config = JSONObject().apply {
            put("thingName", data.getString("thingName"))
            put("iotEndpoint", data.getString("iotEndpoint"))
        }
        File(filesDir, "iot_config.json").writeText(config.toString())
        Log.i(TAG, "Saved iot_config.json for ${data.getString("thingName")}")
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics
        ).toInt()
    }
}
