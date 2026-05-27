#!/usr/bin/env sh
set -eu

PORT="${1:-8081}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

if ! command -v lsof >/dev/null 2>&1; then
  exit 0
fi

PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"

if [ -z "$PIDS" ]; then
  exit 0
fi

for PID in $PIDS; do
  COMMAND="$(ps -p "$PID" -o command= 2>/dev/null || true)"

  case "$COMMAND" in
    *"$PROJECT_ROOT/node_modules/.bin/expo run:android"*|*"$PROJECT_ROOT/node_modules/.bin/expo run:ios"*|*"expo run:android"*"$PROJECT_ROOT"*|*"expo run:ios"*"$PROJECT_ROOT"*)
      echo "Stopping stale Expo run process on port $PORT: pid $PID"
      kill "$PID" 2>/dev/null || true
      ;;
    *)
      ;;
  esac
done

sleep 1
