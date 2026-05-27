#!/usr/bin/env sh
set -eu

DEFAULT_ANDROID_HOME="$HOME/Library/Android/sdk"

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$DEFAULT_ANDROID_HOME" ]; then
  export ANDROID_HOME="$DEFAULT_ANDROID_HOME"
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "adb was not found. Install Android SDK platform-tools or export ANDROID_HOME."
  exit 1
fi

DEVICE="${ANDROID_SERIAL:-}"
if [ -z "$DEVICE" ]; then
  DEVICE="$(adb devices | awk 'NR > 1 && $1 ~ /^emulator-/ && $2 == "device" { print $1; exit }')"
fi

if [ -z "$DEVICE" ]; then
  echo "No running Android emulator was found."
  echo "Start one with npm run android, then rerun this command."
  exit 1
fi

case "$DEVICE" in
  emulator-*) ;;
  *)
    echo "Device '$DEVICE' is not an emulator. This diagnostic uses emulator GPS injection."
    exit 1
    ;;
esac

PACKAGE_NAME="com.v3l0city.app"
DURATION_SECONDS="${V3L0CITY_DIAG_DURATION_SECONDS:-25}"
METRO_URL="${V3L0CITY_DIAG_METRO_URL:-http://10.0.2.2:8081}"

echo "Preparing Android speed diagnostic on $DEVICE."
adb -s "$DEVICE" shell pm grant "$PACKAGE_NAME" android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1 || true
adb -s "$DEVICE" shell pm grant "$PACKAGE_NAME" android.permission.ACCESS_COARSE_LOCATION >/dev/null 2>&1 || true
adb -s "$DEVICE" shell appops set "$PACKAGE_NAME" FINE_LOCATION allow >/dev/null 2>&1 || true
adb -s "$DEVICE" shell appops set "$PACKAGE_NAME" COARSE_LOCATION foreground >/dev/null 2>&1 || true
adb -s "$DEVICE" shell setprop log.tag.V3l0citySpeedEngine DEBUG
adb -s "$DEVICE" logcat -c
adb -s "$DEVICE" shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true

echo "Launching V3l0city. Keep the app foregrounded; if Metro is not running, start npm run android first."
if [ -n "$METRO_URL" ] && command -v node >/dev/null 2>&1; then
  ENCODED_METRO_URL="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$METRO_URL")"
  adb -s "$DEVICE" shell am start \
    -a android.intent.action.VIEW \
    -d "com.v3l0city.app://expo-development-client/?url=$ENCODED_METRO_URL" >/dev/null 2>&1 || true
else
  adb -s "$DEVICE" shell monkey -p "$PACKAGE_NAME" 1 >/dev/null 2>&1 || true
fi
sleep 3

echo "Injecting ${DURATION_SECONDS}s of GPS route data..."
V3L0CITY_SIM_DURATION_SECONDS="$DURATION_SECONDS" sh "$(dirname "$0")/simulate-android-drive.sh"

echo
echo "Native speed-engine log:"
adb -s "$DEVICE" logcat -d -v time V3l0citySpeedEngine:D '*:S' | tail -n 120

echo
echo "Android location service snapshot:"
adb -s "$DEVICE" shell dumpsys location |
  rg -n "gps provider|fused provider|last location|ProviderRequest|com.v3l0city.app|vel=" -i -C 2 |
  head -n 120 || true
