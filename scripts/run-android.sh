#!/usr/bin/env sh
set -eu

DEFAULT_ANDROID_HOME="$HOME/Library/Android/sdk"
HOMEBREW_JAVA_17_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$DEFAULT_ANDROID_HOME" ]; then
  export ANDROID_HOME="$DEFAULT_ANDROID_HOME"
fi

if [ -z "${ANDROID_SDK_ROOT:-}" ] && [ -n "${ANDROID_HOME:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
fi

if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOMEBREW_JAVA_17_HOME" ]; then
  export JAVA_HOME="$HOMEBREW_JAVA_17_HOME"
fi

if [ -z "${JAVA_HOME:-}" ] && command -v brew >/dev/null 2>&1; then
  BREW_JAVA_17_HOME="$(brew --prefix openjdk@17 2>/dev/null || true)/libexec/openjdk.jdk/Contents/Home"
  if [ -d "$BREW_JAVA_17_HOME" ]; then
    export JAVA_HOME="$BREW_JAVA_17_HOME"
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "Android platform-tools were not found."
  echo "Install Android Studio SDK tools or export ANDROID_HOME before running this command."
  exit 1
fi

if ! command -v emulator >/dev/null 2>&1; then
  echo "Android emulator tools were not found."
  echo "Install Android Studio Emulator tools or export ANDROID_HOME before running this command."
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java 17 was not found."
  echo "Install it with: brew install openjdk@17"
  echo "Or export JAVA_HOME before running npm run android."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
sh "$SCRIPT_DIR/ensure-clean-metro-port.sh" 8081

if ! adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'; then
  FIRST_AVD="$(emulator -list-avds | awk 'NF { print; exit }')"
  if [ -z "$FIRST_AVD" ]; then
    echo "No Android device is connected and no Android emulators are configured."
    echo "Create an emulator in Android Studio, then rerun npm run android."
    exit 1
  fi

  echo "No Android device is currently connected. Starting emulator: $FIRST_AVD"
  nohup emulator -avd "$FIRST_AVD" >/tmp/v3l0city-android-emulator.log 2>&1 &

  echo "Waiting for Android emulator to boot..."
  adb wait-for-device
  BOOTED="0"
  for _ in $(seq 1 120); do
    BOOTED="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [ "$BOOTED" = "1" ]; then
      break
    fi
    sleep 2
  done

  if [ "$BOOTED" != "1" ]; then
    echo "The emulator did not finish booting in time."
    echo "Emulator log: /tmp/v3l0city-android-emulator.log"
    exit 1
  fi

  adb shell input keyevent 82 >/dev/null 2>&1 || true
fi

if [ -x "./node_modules/.bin/expo" ]; then
  exec ./node_modules/.bin/expo run:android "$@"
fi

exec npx expo run:android "$@"
