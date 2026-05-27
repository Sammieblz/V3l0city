#import "SpeedEngineWrapper.h"

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

NSString *sourceString(SpeedSource source) {
  switch (source) {
    case SpeedSource::Gps:
      return @"gps";
    case SpeedSource::Blended:
      return @"blended";
    case SpeedSource::MotionOnly:
      return @"motion-only";
    case SpeedSource::None:
    default:
      return @"none";
  }
}

NSString *qualityString(SignalQuality quality) {
  switch (quality) {
    case SignalQuality::Good:
      return @"good";
    case SignalQuality::Poor:
      return @"poor";
    case SignalQuality::Medium:
    default:
      return @"medium";
  }
}

NSString *headingSourceString(HeadingSource source) {
  switch (source) {
    case HeadingSource::Course:
      return @"course";
    case HeadingSource::Device:
      return @"device";
    case HeadingSource::None:
    default:
      return @"none";
  }
}

NSDictionary *stateDictionary(const SpeedState &state) {
  NSMutableArray *qualityReasons = [NSMutableArray array];
  if ((state.qualityReasonMask & v3l0city::QualityReasonStale) != 0) {
    [qualityReasons addObject:@"stale"];
  }
  if ((state.qualityReasonMask & v3l0city::QualityReasonPoorAccuracy) != 0) {
    [qualityReasons addObject:@"poor-accuracy"];
  }
  if ((state.qualityReasonMask & v3l0city::QualityReasonOutlierRejected) != 0) {
    [qualityReasons addObject:@"outlier-rejected"];
  }
  if ((state.qualityReasonMask & v3l0city::QualityReasonImuPredicted) != 0) {
    [qualityReasons addObject:@"imu-predicted"];
  }
  if ((state.qualityReasonMask & v3l0city::QualityReasonNoGps) != 0) {
    [qualityReasons addObject:@"no-gps"];
  }
  if ((state.qualityReasonMask & v3l0city::QualityReasonNativeSpeedUsed) != 0) {
    [qualityReasons addObject:@"native-speed-used"];
  }

  NSMutableArray *headingReasons = [NSMutableArray array];
  if ((state.headingReasonMask & v3l0city::HeadingReasonCourseUsed) != 0) {
    [headingReasons addObject:@"course-used"];
  }
  if ((state.headingReasonMask & v3l0city::HeadingReasonDeviceHeadingUsed) != 0) {
    [headingReasons addObject:@"device-heading-used"];
  }
  if ((state.headingReasonMask & v3l0city::HeadingReasonLowSpeedCourseIgnored) != 0) {
    [headingReasons addObject:@"low-speed-course-ignored"];
  }
  if ((state.headingReasonMask & v3l0city::HeadingReasonPoorHeadingAccuracy) != 0) {
    [headingReasons addObject:@"poor-heading-accuracy"];
  }
  if ((state.headingReasonMask & v3l0city::HeadingReasonNoHeading) != 0) {
    [headingReasons addObject:@"no-heading"];
  }
  if ((state.headingReasonMask & v3l0city::HeadingReasonPreciseLocationRequired) != 0) {
    [headingReasons addObject:@"precise-location-required"];
  }

  return @{
    @"speedMps": @(state.speedMps),
    @"averageSpeedMps": @(state.averageSpeedMps),
    @"maxSpeedMps": @(state.maxSpeedMps),
    @"distanceMeters": @(state.distanceMeters),
    @"headingDegrees": state.hasHeading ? @(state.headingDegrees) : (id)[NSNull null],
    @"source": sourceString(state.source),
    @"quality": qualityString(state.quality),
    @"isMoving": @(state.isMoving),
    @"isStopped": @(state.isStopped),
    @"stale": @(state.stale),
    @"gpsAvailable": @(state.gpsAvailable),
    @"motionAvailable": @(state.motionAvailable),
    @"headingAvailable": @(state.headingAvailable),
    @"timestampMs": @(state.timestampMs),
    @"qualityScore": @(state.qualityScore),
    @"qualityReasons": qualityReasons,
    @"gpsAccuracyMeters": state.hasGpsAccuracy ? @(state.gpsAccuracyMeters) : (id)[NSNull null],
    @"fixAgeMs": state.hasFixAge ? @(state.fixAgeMs) : (id)[NSNull null],
    @"nativeSpeedUsed": @(state.nativeSpeedUsed),
    @"headingSource": headingSourceString(state.headingSource),
    @"headingAccuracyDegrees": state.hasHeadingAccuracy ? @(state.headingAccuracyDegrees) : (id)[NSNull null],
    @"headingQuality": qualityString(state.headingQuality),
    @"headingReasons": headingReasons
  };
}

} // namespace

@implementation V3l0citySpeedEngineWrapper {
  SpeedEngine _engine;
}

- (void)setOptionsWithStaleTimeoutMs:(double)staleTimeoutMs
                        outputRateHz:(double)outputRateHz
                   mountOffsetDegrees:(double)mountOffsetDegrees
                       accumulateTrip:(BOOL)accumulateTrip
{
  EngineOptions options;
  options.staleTimeoutMs = staleTimeoutMs;
  options.outputRateHz = outputRateHz;
  options.mountOffsetDegrees = mountOffsetDegrees;
  options.accumulateTrip = accumulateTrip;
  _engine.setOptions(options);
}

- (NSDictionary *)reset
{
  _engine.reset();
  return stateDictionary(_engine.state());
}

- (void)setTripAccumulation:(BOOL)active
{
  _engine.setTripAccumulation(active);
}

- (void)setMountOffsetDegrees:(double)value
{
  _engine.setMountOffsetDegrees(value);
}

- (NSDictionary *)onLocationWithLatitude:(double)latitude
                                longitude:(double)longitude
                           accuracyMeters:(double)accuracyMeters
                           nativeSpeedMps:(double)nativeSpeedMps
                              timestampMs:(double)timestampMs
                            courseDegrees:(double)courseDegrees
                     courseAccuracyDegrees:(double)courseAccuracyDegrees
{
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
  return stateDictionary(_engine.onLocation(sample));
}

- (NSDictionary *)onHeadingWithDegrees:(double)headingDegrees
                            timestampMs:(double)timestampMs
                       accuracyDegrees:(double)accuracyDegrees
{
  HeadingSample sample;
  sample.headingDegrees = headingDegrees;
  sample.hasHeading = headingDegrees >= 0.0;
  sample.timestampMs = timestampMs;
  sample.hasAccuracy = accuracyDegrees >= 0.0;
  sample.accuracyDegrees = accuracyDegrees;
  return stateDictionary(_engine.onHeading(sample));
}

- (NSDictionary *)onImuWithForwardAcceleration:(double)forwardAccelerationMps2
                                   timestampMs:(double)timestampMs
{
  ImuSample sample;
  sample.forwardAccelerationMps2 = forwardAccelerationMps2;
  sample.timestampMs = timestampMs;
  return stateDictionary(_engine.onImu(sample));
}

- (NSDictionary *)checkStaleAtTimestampMs:(double)timestampMs
{
  return stateDictionary(_engine.checkStale(timestampMs));
}

- (NSDictionary *)currentState
{
  return stateDictionary(_engine.state());
}

@end
