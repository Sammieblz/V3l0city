cmake_minimum_required(VERSION 3.22.1)

project(V3l0citySpeedEngine)

add_library(
  v3l0cityspeedengine
  SHARED
  src/main/cpp/V3l0citySpeedEngineJni.cpp
  ../common/cpp/SpeedEngine.cpp
)

target_include_directories(
  v3l0cityspeedengine
  PRIVATE
  ../common/cpp
)

target_compile_features(v3l0cityspeedengine PRIVATE cxx_std_20)

target_link_options(
  v3l0cityspeedengine
  PRIVATE
  "-Wl,-z,max-page-size=16384"
  "-Wl,-z,common-page-size=16384"
)

find_library(log-lib log)

target_link_libraries(
  v3l0cityspeedengine
  ${log-lib}
)
