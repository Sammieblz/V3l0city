#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/tests/.build"
mkdir -p "$BUILD_DIR"

c++ -std=c++20 -Wall -Wextra -Werror \
  -I"$ROOT_DIR" \
  "$ROOT_DIR/SpeedEngine.cpp" \
  "$ROOT_DIR/tests/SpeedEngineTests.cpp" \
  -o "$BUILD_DIR/speed_engine_tests"

"$BUILD_DIR/speed_engine_tests"
