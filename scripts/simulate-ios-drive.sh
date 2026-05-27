#!/usr/bin/env sh
set -eu

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun was not found. Install Xcode command line tools before running this command."
  exit 1
fi

DEVICE="${IOS_SIMULATOR_UDID:-}"
if [ -z "$DEVICE" ]; then
  DEVICE="$(
    xcrun simctl list devices booted |
      sed -n 's/.*(\([0-9A-Fa-f-][0-9A-Fa-f-]*\)) (Booted).*/\1/p' |
      awk 'NF { print; exit }'
  )"
fi

if [ -z "$DEVICE" ]; then
  echo "No booted iOS simulator was found."
  echo "Start one with npm run ios, then rerun this command."
  exit 1
fi

PACKAGE_NAME="${V3L0CITY_IOS_BUNDLE_ID:-com.v3l0city.app}"
DURATION_SECONDS="${V3L0CITY_SIM_DURATION_SECONDS:-75}"
INTERVAL_SECONDS="${V3L0CITY_SIM_INTERVAL_SECONDS:-0.5}"
START_LAT="${V3L0CITY_SIM_START_LAT:-37.7749}"
START_LON="${V3L0CITY_SIM_START_LON:--122.4194}"
HEADING_DEGREES="${V3L0CITY_SIM_HEADING_DEGREES:-42}"

LAST_LAT="$START_LAT"
LAST_LON="$START_LON"

set_location() {
  lat="$1"
  lon="$2"
  xcrun simctl location "$DEVICE" set "$lat,$lon" >/dev/null
}

stop_at_last_fix() {
  set_location "$LAST_LAT" "$LAST_LON" || true
  sleep "$INTERVAL_SECONDS" || true
  set_location "$LAST_LAT" "$LAST_LON" || true
  echo
  echo "Stopped iOS GPS route at $LAST_LAT,$LAST_LON."
}

trap stop_at_last_fix INT TERM

xcrun simctl privacy "$DEVICE" grant location "$PACKAGE_NAME" >/dev/null 2>&1 || true
xcrun simctl privacy "$DEVICE" grant motion "$PACKAGE_NAME" >/dev/null 2>&1 || true

echo "Streaming a synthetic GPS drive to iOS simulator $DEVICE."
echo "Open V3l0city, keep it foregrounded, and make sure Drive Simulator is off."
echo "Duration: ${DURATION_SECONDS}s, interval: ${INTERVAL_SECONDS}s"
echo "Press Ctrl-C to stop early."

set_location "$START_LAT" "$START_LON"

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

  set_location "$LAST_LAT" "$LAST_LON"
  printf "\r%5ss  %6.2f m/s  %7.1f m  %s,%s" "$elapsed" "$speed_mps" "$distance_meters" "$LAST_LAT" "$LAST_LON"

  tick=$((tick + 1))
  sleep "$INTERVAL_SECONDS"
done

stop_at_last_fix
