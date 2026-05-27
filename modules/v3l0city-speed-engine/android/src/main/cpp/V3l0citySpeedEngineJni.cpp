#include <jni.h>

#include "SpeedEngine.h"

using v3l0city::EngineOptions;
using v3l0city::HeadingSample;
using v3l0city::ImuSample;
using v3l0city::LocationSample;
using v3l0city::SignalQuality;
using v3l0city::SpeedEngine;
using v3l0city::SpeedSource;
using v3l0city::SpeedState;
using v3l0city::HeadingSource;

namespace {

SpeedEngine *engineFromHandle(jlong handle) {
  return reinterpret_cast<SpeedEngine *>(handle);
}

jstring sourceString(JNIEnv *env, SpeedSource source) {
  switch (source) {
    case SpeedSource::Gps:
      return env->NewStringUTF("gps");
    case SpeedSource::Blended:
      return env->NewStringUTF("blended");
    case SpeedSource::MotionOnly:
      return env->NewStringUTF("motion-only");
    case SpeedSource::None:
    default:
      return env->NewStringUTF("none");
  }
}

jstring qualityString(JNIEnv *env, SignalQuality quality) {
  switch (quality) {
    case SignalQuality::Good:
      return env->NewStringUTF("good");
    case SignalQuality::Poor:
      return env->NewStringUTF("poor");
    case SignalQuality::Medium:
    default:
      return env->NewStringUTF("medium");
  }
}

jstring headingSourceString(JNIEnv *env, HeadingSource source) {
  switch (source) {
    case HeadingSource::Course:
      return env->NewStringUTF("course");
    case HeadingSource::Device:
      return env->NewStringUTF("device");
    case HeadingSource::None:
    default:
      return env->NewStringUTF("none");
  }
}

jobject boxDouble(JNIEnv *env, double value) {
  jclass doubleClass = env->FindClass("java/lang/Double");
  jmethodID ctor = env->GetMethodID(doubleClass, "<init>", "(D)V");
  return env->NewObject(doubleClass, ctor, value);
}

jobject boxBoolean(JNIEnv *env, bool value) {
  jclass booleanClass = env->FindClass("java/lang/Boolean");
  jmethodID valueOf = env->GetStaticMethodID(booleanClass, "valueOf", "(Z)Ljava/lang/Boolean;");
  return env->CallStaticObjectMethod(booleanClass, valueOf, value ? JNI_TRUE : JNI_FALSE);
}

jobject stringList(JNIEnv *env, int reasonMask) {
  jclass listClass = env->FindClass("java/util/ArrayList");
  jmethodID ctor = env->GetMethodID(listClass, "<init>", "()V");
  jmethodID add = env->GetMethodID(listClass, "add", "(Ljava/lang/Object;)Z");
  jobject list = env->NewObject(listClass, ctor);

  auto addReason = [&](const char *reason) {
    jstring value = env->NewStringUTF(reason);
    env->CallBooleanMethod(list, add, value);
    env->DeleteLocalRef(value);
  };

  if ((reasonMask & v3l0city::QualityReasonStale) != 0) {
    addReason("stale");
  }
  if ((reasonMask & v3l0city::QualityReasonPoorAccuracy) != 0) {
    addReason("poor-accuracy");
  }
  if ((reasonMask & v3l0city::QualityReasonOutlierRejected) != 0) {
    addReason("outlier-rejected");
  }
  if ((reasonMask & v3l0city::QualityReasonImuPredicted) != 0) {
    addReason("imu-predicted");
  }
  if ((reasonMask & v3l0city::QualityReasonNoGps) != 0) {
    addReason("no-gps");
  }
  if ((reasonMask & v3l0city::QualityReasonNativeSpeedUsed) != 0) {
    addReason("native-speed-used");
  }

  return list;
}

jobject headingReasonList(JNIEnv *env, int reasonMask) {
  jclass listClass = env->FindClass("java/util/ArrayList");
  jmethodID ctor = env->GetMethodID(listClass, "<init>", "()V");
  jmethodID add = env->GetMethodID(listClass, "add", "(Ljava/lang/Object;)Z");
  jobject list = env->NewObject(listClass, ctor);

  auto addReason = [&](const char *reason) {
    jstring value = env->NewStringUTF(reason);
    env->CallBooleanMethod(list, add, value);
    env->DeleteLocalRef(value);
  };

  if ((reasonMask & v3l0city::HeadingReasonCourseUsed) != 0) {
    addReason("course-used");
  }
  if ((reasonMask & v3l0city::HeadingReasonDeviceHeadingUsed) != 0) {
    addReason("device-heading-used");
  }
  if ((reasonMask & v3l0city::HeadingReasonLowSpeedCourseIgnored) != 0) {
    addReason("low-speed-course-ignored");
  }
  if ((reasonMask & v3l0city::HeadingReasonPoorHeadingAccuracy) != 0) {
    addReason("poor-heading-accuracy");
  }
  if ((reasonMask & v3l0city::HeadingReasonNoHeading) != 0) {
    addReason("no-heading");
  }
  if ((reasonMask & v3l0city::HeadingReasonPreciseLocationRequired) != 0) {
    addReason("precise-location-required");
  }

  return list;
}

void putObject(JNIEnv *env, jobject map, const char *key, jobject value) {
  jclass mapClass = env->FindClass("java/util/HashMap");
  jmethodID put = env->GetMethodID(
      mapClass,
      "put",
      "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
  jstring keyString = env->NewStringUTF(key);
  env->CallObjectMethod(map, put, keyString, value);
  env->DeleteLocalRef(keyString);
}

void putDouble(JNIEnv *env, jobject map, const char *key, double value) {
  jobject boxed = boxDouble(env, value);
  putObject(env, map, key, boxed);
  env->DeleteLocalRef(boxed);
}

void putBoolean(JNIEnv *env, jobject map, const char *key, bool value) {
  jobject boxed = boxBoolean(env, value);
  putObject(env, map, key, boxed);
  env->DeleteLocalRef(boxed);
}

jobject stateMap(JNIEnv *env, const SpeedState &state) {
  jclass mapClass = env->FindClass("java/util/HashMap");
  jmethodID ctor = env->GetMethodID(mapClass, "<init>", "()V");
  jobject map = env->NewObject(mapClass, ctor);

  putDouble(env, map, "speedMps", state.speedMps);
  putDouble(env, map, "averageSpeedMps", state.averageSpeedMps);
  putDouble(env, map, "maxSpeedMps", state.maxSpeedMps);
  putDouble(env, map, "distanceMeters", state.distanceMeters);
  if (state.hasHeading) {
    putDouble(env, map, "headingDegrees", state.headingDegrees);
  } else {
    putObject(env, map, "headingDegrees", nullptr);
  }
  jstring source = sourceString(env, state.source);
  putObject(env, map, "source", source);
  env->DeleteLocalRef(source);
  jstring quality = qualityString(env, state.quality);
  putObject(env, map, "quality", quality);
  env->DeleteLocalRef(quality);
  putBoolean(env, map, "isMoving", state.isMoving);
  putBoolean(env, map, "isStopped", state.isStopped);
  putBoolean(env, map, "stale", state.stale);
  putBoolean(env, map, "gpsAvailable", state.gpsAvailable);
  putBoolean(env, map, "motionAvailable", state.motionAvailable);
  putBoolean(env, map, "headingAvailable", state.headingAvailable);
  putDouble(env, map, "timestampMs", state.timestampMs);
  putDouble(env, map, "qualityScore", state.qualityScore);
  jobject reasons = stringList(env, state.qualityReasonMask);
  putObject(env, map, "qualityReasons", reasons);
  env->DeleteLocalRef(reasons);
  if (state.hasGpsAccuracy) {
    putDouble(env, map, "gpsAccuracyMeters", state.gpsAccuracyMeters);
  } else {
    putObject(env, map, "gpsAccuracyMeters", nullptr);
  }
  if (state.hasFixAge) {
    putDouble(env, map, "fixAgeMs", state.fixAgeMs);
  } else {
    putObject(env, map, "fixAgeMs", nullptr);
  }
  putBoolean(env, map, "nativeSpeedUsed", state.nativeSpeedUsed);
  jstring headingSource = headingSourceString(env, state.headingSource);
  putObject(env, map, "headingSource", headingSource);
  env->DeleteLocalRef(headingSource);
  if (state.hasHeadingAccuracy) {
    putDouble(env, map, "headingAccuracyDegrees", state.headingAccuracyDegrees);
  } else {
    putObject(env, map, "headingAccuracyDegrees", nullptr);
  }
  jstring headingQuality = qualityString(env, state.headingQuality);
  putObject(env, map, "headingQuality", headingQuality);
  env->DeleteLocalRef(headingQuality);
  jobject headingReasons = headingReasonList(env, state.headingReasonMask);
  putObject(env, map, "headingReasons", headingReasons);
  env->DeleteLocalRef(headingReasons);

  return map;
}

} // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_create(JNIEnv *, jobject) {
  return reinterpret_cast<jlong>(new SpeedEngine());
}

extern "C" JNIEXPORT void JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_destroy(JNIEnv *, jobject, jlong handle) {
  delete engineFromHandle(handle);
}

extern "C" JNIEXPORT void JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_setOptions(
    JNIEnv *,
    jobject,
    jlong handle,
    jdouble staleTimeoutMs,
    jdouble outputRateHz,
    jdouble mountOffsetDegrees,
    jboolean accumulateTrip) {
  if (auto *engine = engineFromHandle(handle)) {
    EngineOptions options;
    options.staleTimeoutMs = staleTimeoutMs;
    options.outputRateHz = outputRateHz;
    options.mountOffsetDegrees = mountOffsetDegrees;
    options.accumulateTrip = accumulateTrip == JNI_TRUE;
    engine->setOptions(options);
  }
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_reset(JNIEnv *env, jobject, jlong handle) {
  auto *engine = engineFromHandle(handle);
  if (!engine) {
    return nullptr;
  }
  engine->reset();
  return stateMap(env, engine->state());
}

extern "C" JNIEXPORT void JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_setTripAccumulation(
    JNIEnv *,
    jobject,
    jlong handle,
    jboolean active) {
  if (auto *engine = engineFromHandle(handle)) {
    engine->setTripAccumulation(active == JNI_TRUE);
  }
}

extern "C" JNIEXPORT void JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_setMountOffsetDegrees(
    JNIEnv *,
    jobject,
    jlong handle,
    jdouble value) {
  if (auto *engine = engineFromHandle(handle)) {
    engine->setMountOffsetDegrees(value);
  }
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_onLocation(
    JNIEnv *env,
    jobject,
    jlong handle,
    jdouble latitude,
    jdouble longitude,
    jdouble accuracyMeters,
    jdouble nativeSpeedMps,
    jdouble timestampMs,
    jdouble courseDegrees,
    jdouble courseAccuracyDegrees) {
  auto *engine = engineFromHandle(handle);
  if (!engine) {
    return nullptr;
  }
  LocationSample sample;
  sample.latitude = latitude;
  sample.longitude = longitude;
  sample.hasAccuracy = accuracyMeters >= 0.0;
  sample.accuracyMeters = accuracyMeters;
  sample.hasNativeSpeed = nativeSpeedMps >= 0.0;
  sample.nativeSpeedMps = nativeSpeedMps;
  sample.timestampMs = timestampMs;
  sample.hasCourse = courseDegrees >= 0.0;
  sample.courseDegrees = courseDegrees;
  sample.hasCourseAccuracy = courseAccuracyDegrees >= 0.0;
  sample.courseAccuracyDegrees = courseAccuracyDegrees;
  return stateMap(env, engine->onLocation(sample));
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_onHeading(
    JNIEnv *env,
    jobject,
    jlong handle,
    jdouble headingDegrees,
    jdouble timestampMs,
    jdouble accuracyDegrees) {
  auto *engine = engineFromHandle(handle);
  if (!engine) {
    return nullptr;
  }
  HeadingSample sample;
  sample.headingDegrees = headingDegrees;
  sample.hasHeading = headingDegrees >= 0.0;
  sample.timestampMs = timestampMs;
  sample.hasAccuracy = accuracyDegrees >= 0.0;
  sample.accuracyDegrees = accuracyDegrees;
  return stateMap(env, engine->onHeading(sample));
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_onImu(
    JNIEnv *env,
    jobject,
    jlong handle,
    jdouble forwardAccelerationMps2,
    jdouble timestampMs) {
  auto *engine = engineFromHandle(handle);
  if (!engine) {
    return nullptr;
  }
  ImuSample sample;
  sample.forwardAccelerationMps2 = forwardAccelerationMps2;
  sample.timestampMs = timestampMs;
  return stateMap(env, engine->onImu(sample));
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_checkStale(
    JNIEnv *env,
    jobject,
    jlong handle,
    jdouble timestampMs) {
  auto *engine = engineFromHandle(handle);
  if (!engine) {
    return nullptr;
  }
  return stateMap(env, engine->checkStale(timestampMs));
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_v3l0city_speedengine_SpeedEngineJni_currentState(JNIEnv *env, jobject, jlong handle) {
  auto *engine = engineFromHandle(handle);
  if (!engine) {
    return nullptr;
  }
  return stateMap(env, engine->state());
}
