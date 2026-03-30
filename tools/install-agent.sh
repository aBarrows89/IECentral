#!/bin/bash
# IE Tires — Scanner Agent Installer
# Run this once per new scanner with USB connected.
# After this, everything else is done wirelessly via IECentral.
#
# Usage: ./install-agent.sh [path-to-apk]

set -e

APK="${1:-/tmp/scanner-agent-v1.1.0.apk}"
S3_APK="s3://ietires-scanner-assets/apks/scanner-agent-1.1.0.apk"

echo ""
echo "========================================"
echo "  IE Tires — Scanner Agent Installer"
echo "========================================"
echo ""

# Check ADB
if ! command -v adb &>/dev/null; then
  echo "ERROR: ADB not found. Install: brew install android-platform-tools"
  exit 1
fi

# Check device
DEVICE=$(adb devices | grep -w device | head -1 | cut -f1)
if [ -z "$DEVICE" ]; then
  echo "ERROR: No device connected. Plug in a scanner and enable USB debugging."
  exit 1
fi

SERIAL=$(adb shell getprop ro.serialno 2>/dev/null | tr -d '\r')
MODEL=$(adb shell getprop ro.product.model 2>/dev/null | tr -d '\r')
echo "Device: $MODEL (serial: $SERIAL)"

# Download APK from S3 if not found locally
if [ ! -f "$APK" ]; then
  echo "Downloading agent APK from S3..."
  aws s3 cp "$S3_APK" "$APK" --region us-east-1
fi

# Install agent APK
echo ""
echo "Installing Scanner Agent..."
adb install -r "$APK"
echo "✓ Agent installed"

# Grant location permission
echo ""
echo "Granting permissions..."
adb shell pm grant com.ietires.scanneragent android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
adb shell pm grant com.ietires.scanneragent android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true
adb shell pm grant com.ietires.scanneragent android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null || true
adb shell pm grant com.ietires.scanneragent android.permission.READ_EXTERNAL_STORAGE 2>/dev/null || true
echo "✓ Permissions granted"

# Activate device admin
echo ""
echo "Activating device admin..."
adb shell dpm set-active-admin com.ietires.scanneragent/.DeviceAdminReceiver 2>/dev/null || echo "⚠ Device admin activation failed — do manually"
echo "✓ Device admin set"

# Disable bloatware
echo ""
echo "Disabling bloatware..."
BLOAT=(
  com.google.android.youtube
  com.google.android.music
  com.google.android.videos
  com.google.android.apps.docs
  com.google.android.apps.photos
  com.google.android.apps.maps
  com.google.android.gm
  com.google.android.apps.tachyon
  com.google.android.googlequicksearchbox
  com.android.chrome
  com.android.vending
  com.google.android.apps.magazines
  com.google.android.calendar
  com.google.android.apps.messaging
  com.google.android.dialer
  com.google.android.contacts
  com.google.android.deskclock
  com.android.calculator2
  com.android.camera2
  com.android.gallery3d
  com.android.music
  com.android.email
  com.android.browser
  com.android.htmlviewer
)
DISABLED=0
for pkg in "${BLOAT[@]}"; do
  if adb shell pm disable-user --user 0 "$pkg" 2>/dev/null | grep -q "disabled"; then
    DISABLED=$((DISABLED + 1))
  fi
done
echo "✓ Disabled $DISABLED bloatware apps"

# Set screen timeout and rotation
echo ""
echo "Applying device settings..."
adb shell settings put system screen_off_timeout 1800000
adb shell settings put system accelerometer_rotation 0
echo "✓ Screen timeout 30min, auto-rotate off"

# Launch the agent
echo ""
echo "Launching Scanner Agent..."
adb shell am start -n com.ietires.scanneragent/.MainActivity
echo ""
echo "========================================"
echo "  ✓ Done! Scanner is ready for setup."
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Open IECentral → Equipment → Scanners"
echo "  2. Add Scanner → select location → create"
echo "  3. Click Provision → get the claim code"
echo "  4. Enter the code on the scanner's setup screen"
echo "  5. Everything else is automatic"
echo ""
