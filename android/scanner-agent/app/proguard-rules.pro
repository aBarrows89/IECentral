# Keep MQTT classes
-keep class org.eclipse.paho.** { *; }
-keep class com.ietires.scanneragent.** { *; }

# Keep BouncyCastle for PEM key loading
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**
