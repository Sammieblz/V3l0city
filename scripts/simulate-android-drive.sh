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
    echo "Device '$DEVICE' is not an emulator. 'adb emu geo fix' only works with emulators."
    exit 1
    ;;
esac

DURATION_SECONDS="${V3L0CITY_SIM_DURATION_SECONDS:-75}"
INTERVAL_SECONDS="${V3L0CITY_SIM_INTERVAL_SECONDS:-0.5}"
START_LAT="${V3L0CITY_SIM_START_LAT:-37.7749}"
START_LON="${V3L0CITY_SIM_START_LON:--122.4194}"
HEADING_DEGREES="${V3L0CITY_SIM_HEADING_DEGREES:-42}"
ALTITUDE_METERS="${V3L0CITY_SIM_ALTITUDE_METERS:-12}"
SATELLITES="${V3L0CITY_SIM_SATELLITES:-10}"

LAST_LAT="$START_LAT"
LAST_LON="$START_LON"

send_fix() {
  lon="$1"
  lat="$2"
  speed_mps="$3"
  knots="$(awk -v speed="$speed_mps" 'BEGIN { printf "%.3f", speed * 1.943844492 }')"
  adb -s "$DEVICE" emu geo fix "$lon" "$lat" "$ALTITUDE_METERS" "$SATELLITES" "$knots" >/dev/null
}

stop_at_last_fix() {
  send_fix "$LAST_LON" "$LAST_LAT" 0 || true
  echo
  echo "Stopped Android GPS route at $LAST_LAT,$LAST_LON."
}

trap stop_at_last_fix INT TERM

echo "Streaming a synthetic GPS drive to $DEVICE."
echo "Open V3l0city, grant location permission, then start a trip."
echo "Duration: ${DURATION_SECONDS}s, interval: ${INTERVAL_SECONDS}s"
echo "Press Ctrl-C to stop early."

send_fix "$START_LON" "$START_LAT" 0

tick=0
distance_meters=0
while :; do
  values="$(
    awk \
      -v tick="$tick" \
      -v interval="$INTERVAL_SECONDS" \
      -v duration="$DURATION_SECONDS" \
      -v base_lat="$START_LAT" \
      -v base_lon="$START_LON" \
      -v heading_degrees="$HEADING_DEGREES" \
      -v distance="$distance_meters" '
        function clamp(value, min, max) {
          return value < min ? min : value > max ? max : value
        }
        function ease(amount) {
          amount = clamp(amount, 0, 1)
          return amount * amount * (3 - 2 * amount)
        }
        function lerp(from, to, amount) {
          return from + (to - from) * amount
        }
        function speed_profile(elapsed) {
          city = 13.4
          slow = 5.4
          highway = 24.6
          loop = 62
          t = elapsed - int(elapsed / loop) * loop
          if (t < 1.5) return 0
          if (t < 7.5) return lerp(0, city, ease((t - 1.5) / 6))
          if (t < 18) return city + sin(t * 1.7) * 0.7
          if (t < 24) return lerp(city, slow, ease((t - 18) / 6))
          if (t < 29) return slow + sin(t * 1.2) * 0.35
          if (t < 36) return lerp(slow, highway, ease((t - 29) / 7))
          if (t < 50) return highway + sin(t * 0.9) * 1.2
          if (t < 57) return lerp(highway, 0, ease((t - 50) / 7))
          return 0
        }
        BEGIN {
          pi = atan2(0, -1)
          elapsed = tick * interval
          if (elapsed > duration) {
            print "done"
            exit
          }
          speed = speed_profile(elapsed)
          next_distance = distance + speed * interval
          heading = heading_degrees * pi / 180
          north = cos(heading) * next_distance
          east = sin(heading) * next_distance
          lat = base_lat + north / 111320
          lon = base_lon + east / (111320 * cos(base_lat * pi / 180))
          printf "%.8f %.8f %.3f %.3f %.1f", lat, lon, speed, next_distance, elapsed
        }
      '
  )"

  if [ "$values" = "done" ]; then
    break
  fi

  # shellcheck disable=SC2086
  set -- $values
  LAST_LAT="$1"
  LAST_LON="$2"
  speed_mps="$3"
  distance_meters="$4"
  elapsed="$5"

  send_fix "$LAST_LON" "$LAST_LAT" "$speed_mps"
  printf "\r%5ss  %6.2f m/s  %7.1f m  %s,%s" "$elapsed" "$speed_mps" "$distance_meters" "$LAST_LAT" "$LAST_LON"

  tick=$((tick + 1))
  sleep "$INTERVAL_SECONDS"
done

stop_at_last_fix
