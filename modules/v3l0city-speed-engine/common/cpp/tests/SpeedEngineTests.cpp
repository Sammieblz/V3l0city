#include "../SpeedEngine.h"

#include <cassert>
#include <cmath>
#include <iostream>

using namespace v3l0city;

namespace {

LocationSample location(
    double latitude,
    double longitude,
    double timestampMs,
    double nativeSpeedMps = -1.0,
    double accuracyMeters = 5.0) {
  return LocationSample{
      latitude,
      longitude,
      accuracyMeters,
      true,
      nativeSpeedMps,
      nativeSpeedMps >= 0.0,
      timestampMs,
  };
}

LocationSample locationWithCourse(
    double latitude,
    double longitude,
    double timestampMs,
    double nativeSpeedMps,
    double courseDegrees,
    double courseAccuracyDegrees = 5.0) {
  auto sample = location(latitude, longitude, timestampMs, nativeSpeedMps);
  sample.hasCourse = courseDegrees >= 0.0;
  sample.courseDegrees = courseDegrees;
  sample.hasCourseAccuracy = courseAccuracyDegrees >= 0.0;
  sample.courseAccuracyDegrees = courseAccuracyDegrees;
  return sample;
}

HeadingSample heading(
    double headingDegrees,
    double timestampMs,
    double accuracyDegrees = 5.0) {
  return HeadingSample{
      headingDegrees,
      headingDegrees >= 0.0,
      timestampMs,
      accuracyDegrees,
      accuracyDegrees >= 0.0,
  };
}

void assertNear(double actual, double expected, double tolerance) {
  assert(std::abs(actual - expected) <= tolerance);
}

void nativeGpsSpeedIsPreferred() {
  SpeedEngine engine;
  engine.onLocation(location(0.0, 0.0, 0.0, 4.0));
  const auto state = engine.onLocation(location(0.0, 0.002, 1000.0, 6.0));

  assert(state.source == SpeedSource::Gps);
  assert(state.speedMps > 4.0);
  assert(state.speedMps < 7.0);
  assert(state.nativeSpeedUsed);
  assert((state.qualityReasonMask & QualityReasonNativeSpeedUsed) != 0);
  assert(state.qualityScore > 0.8);
}

void distanceTimeFallbackWorks() {
  SpeedEngine engine;
  engine.onLocation(location(0.0, 0.0, 0.0));
  const auto state = engine.onLocation(location(0.0, 0.0001, 1000.0));

  assert(state.source == SpeedSource::Gps);
  assert(state.speedMps > 10.0);
  assert(state.speedMps < 12.5);
  assert(state.distanceMeters > 10.0);
}

void invalidNegativeNativeSpeedFallsBack() {
  SpeedEngine engine;
  engine.onLocation(location(0.0, 0.0, 0.0));
  const auto state = engine.onLocation(location(0.0, 0.0001, 1000.0, -1.0));

  assert(state.speedMps > 10.0);
  assert(state.source == SpeedSource::Gps);
}

void staleTimeoutDecaysToZero() {
  SpeedEngine engine;
  EngineOptions options;
  options.staleTimeoutMs = 3000.0;
  engine.setOptions(options);

  engine.onLocation(location(0.0, 0.0, 0.0, 12.0));
  const auto state = engine.checkStale(3500.0);

  assertNear(state.speedMps, 0.0, 0.001);
  assert(state.stale);
  assert(state.source == SpeedSource::None);
  assert(state.quality == SignalQuality::Poor);
  assert((state.qualityReasonMask & QualityReasonStale) != 0);
  assert(state.qualityScore < 0.3);
}

void imuPredictionBetweenGpsSamples() {
  SpeedEngine engine;
  engine.onLocation(location(0.0, 0.0, 0.0, 10.0));
  engine.onImu(ImuSample{2.0, 100.0});
  const auto state = engine.onImu(ImuSample{2.0, 600.0});

  assert(state.motionAvailable);
  assert(state.speedMps > 10.0);
  assert(state.source == SpeedSource::Blended);
  assert((state.qualityReasonMask & QualityReasonImuPredicted) != 0);
}

void gpsOutlierIsRejected() {
  SpeedEngine engine;
  engine.onLocation(location(0.0, 0.0, 0.0));
  const auto state = engine.onLocation(location(0.0, 1.0, 1000.0));

  assertNear(state.speedMps, 0.0, 0.001);
  assertNear(state.distanceMeters, 0.0, 0.001);
  assert(state.source == SpeedSource::None);
  assert(state.quality == SignalQuality::Poor);
  assert((state.qualityReasonMask & QualityReasonOutlierRejected) != 0);
}

void poorGpsQualityIsDiagnosed() {
  SpeedEngine engine;
  const auto state = engine.onLocation(location(0.0, 0.0, 0.0, 4.0, 80.0));

  assert(state.quality == SignalQuality::Poor);
  assert((state.qualityReasonMask & QualityReasonPoorAccuracy) != 0);
  assert(state.hasGpsAccuracy);
  assertNear(state.gpsAccuracyMeters, 80.0, 0.001);
}

void gpsCourseIsPreferredWhileMoving() {
  SpeedEngine engine;
  engine.onHeading(heading(180.0, 0.0));
  const auto state = engine.onLocation(
      locationWithCourse(0.0, 0.0, 1000.0, 8.0, 32.0, 3.0));

  assert(state.headingSource == HeadingSource::Course);
  assertNear(state.headingDegrees, 32.0, 0.001);
  assert(state.headingQuality == SignalQuality::Good);
  assert((state.headingReasonMask & HeadingReasonCourseUsed) != 0);
}

void deviceHeadingIsUsedWhenSlow() {
  SpeedEngine engine;
  EngineOptions options;
  options.mountOffsetDegrees = 15.0;
  engine.setOptions(options);

  engine.onHeading(heading(180.0, 0.0));
  const auto state = engine.onLocation(
      locationWithCourse(0.0, 0.0, 1000.0, 0.2, 32.0, 3.0));

  assert(state.headingSource == HeadingSource::Device);
  assertNear(state.headingDegrees, 195.0, 0.001);
  assert((state.headingReasonMask & HeadingReasonLowSpeedCourseIgnored) != 0);
  assert((state.headingReasonMask & HeadingReasonDeviceHeadingUsed) != 0);
}

void mountOffsetDoesNotApplyToCourse() {
  SpeedEngine engine;
  EngineOptions options;
  options.mountOffsetDegrees = 90.0;
  engine.setOptions(options);

  const auto state = engine.onLocation(
      locationWithCourse(0.0, 0.0, 1000.0, 8.0, 45.0, 4.0));

  assert(state.headingSource == HeadingSource::Course);
  assertNear(state.headingDegrees, 45.0, 0.001);
}

void invalidCourseFallsBackToDeviceHeading() {
  SpeedEngine engine;
  engine.onHeading(heading(270.0, 0.0));
  const auto state = engine.onLocation(
      locationWithCourse(0.0, 0.0, 1000.0, 8.0, -1.0, -1.0));

  assert(state.headingSource == HeadingSource::Device);
  assertNear(state.headingDegrees, 270.0, 0.001);
}

void poorHeadingAccuracyLowersQuality() {
  SpeedEngine engine;
  const auto state = engine.onHeading(heading(90.0, 0.0, 80.0));

  assert(state.headingSource == HeadingSource::Device);
  assert(state.headingQuality == SignalQuality::Poor);
  assert((state.headingReasonMask & HeadingReasonPoorHeadingAccuracy) != 0);
}

void noHeadingProducesNone() {
  SpeedEngine engine;
  const auto state = engine.onLocation(location(0.0, 0.0, 0.0, 0.0));

  assert(state.headingSource == HeadingSource::None);
  assert(!state.hasHeading);
  assert((state.headingReasonMask & HeadingReasonNoHeading) != 0);
}

} // namespace

int main() {
  nativeGpsSpeedIsPreferred();
  distanceTimeFallbackWorks();
  invalidNegativeNativeSpeedFallsBack();
  staleTimeoutDecaysToZero();
  imuPredictionBetweenGpsSamples();
  gpsOutlierIsRejected();
  poorGpsQualityIsDiagnosed();
  gpsCourseIsPreferredWhileMoving();
  deviceHeadingIsUsedWhenSlow();
  mountOffsetDoesNotApplyToCourse();
  invalidCourseFallsBackToDeviceHeading();
  poorHeadingAccuracyLowersQuality();
  noHeadingProducesNone();

  std::cout << "SpeedEngine C++ tests passed\n";
  return 0;
}
