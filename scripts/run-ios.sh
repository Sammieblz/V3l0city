#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

sh "$SCRIPT_DIR/ensure-clean-metro-port.sh" 8081

if [ -x "./node_modules/.bin/expo" ]; then
  exec ./node_modules/.bin/expo run:ios "$@"
fi

exec npx expo run:ios "$@"
