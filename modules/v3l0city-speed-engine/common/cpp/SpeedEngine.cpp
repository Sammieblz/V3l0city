#include "SpeedEngine.h"

#include <algorithm>
#include <cmath>

namespace v3l0city {
namespace {

constexpr double kEarthRadiusMeters = 6371000.0;
constexpr double kPi = 3.14159265358979323846;

bool finite(double value) {
  return std::isfinite(value);
}

double degreesToRadians(double degrees) {
  return degrees * kPi / 180.0;
}

double clamp(double value, double minValue, double maxValue) {
  return std::max(minValue, std::min(maxValue, value));
}

} // namespace

double haversineMeters(double latitudeA, double longitudeA, double latitudeB, double longitudeB) {
  const double phiA = degreesToRadians(latitudeA);
  const double phiB = degreesToRadians(latitudeB);
  const double deltaPhi = degreesToRadians(latitudeB - latitudeA);
  const double deltaLambda = degreesToRadians(longitudeB - longitudeA);

  const double a = std::sin(deltaPhi / 2.0) * std::sin(deltaPhi / 2.0) +
                   std::cos(phiA) * std::cos(phiB) *
                       std::sin(deltaLambda / 2.0) * std::sin(deltaLambda / 2.0);
  const double c = 2.0 * std::atan2(std::sqrt(a), std::sqrt(1.0 - a));
  return kEarthRadiusMeters * c;
}

double normalizeDegrees(double degrees) {
  if (!finite(degrees)) {
    return 0.0;
  }
  double normalized = std::fmod(degrees, 360.0);
  if (normalized < 0.0) {
    normalized += 360.0;
  }
  return normalized;
}

SpeedEngine::SpeedEngine() {
  reset();
}

void SpeedEngine::setOptions(const EngineOptions &options) {
  options_ = options;
  if (options_.staleTimeoutMs <= 0.0 || !finite(options_.staleTimeoutMs)) {
    options_.staleTimeoutMs = 3000.0;
  }
  if (options_.outputRateHz <= 0.0 || !finite(options_.outputRateHz)) {
    options_.outputRateHz = 10.0;
  }
  if (options_.maxGpsAccuracyMeters <= 0.0 || !finite(options_.maxGpsAccuracyMeters)) {
    options_.maxGpsAccuracyMeters = 25.0;
  }
  if (options_.maxHeadingAccuracyDegrees <= 0.0 || !finite(options_.maxHeadingAccuracyDegrees)) {
    options_.maxHeadingAccuracyDegrees = 45.0;
  }
  if (options_.minCourseSpeedMps < 0.0 || !finite(options_.minCourseSpeedMps)) {
    options_.minCourseSpeedMps = 1.5;
  }
  if (options_.minMovingSpeedMps < 0.0 || !finite(options_.minMovingSpeedMps)) {
    options_.minMovingSpeedMps = 0.5;
  }
  if (options_.maxSpeedMps <= 0.0 || !finite(options_.maxSpeedMps)) {
    options_.maxSpeedMps = 80.0;
  }
  if (options_.maxForwardAccelerationMps2 <= 0.0 || !finite(options_.maxForwardAccelerationMps2)) {
    options_.maxForwardAccelerationMps2 = 6.0;
  }
  if (options_.maxOutlierAccelerationMps2 <= 0.0 || !finite(options_.maxOutlierAccelerationMps2)) {
    options_.maxOutlierAccelerationMps2 = 12.0;
  }
}

const EngineOptions &SpeedEngine::options() const {
  return options_;
}

void SpeedEngine::reset() {
  state_ = SpeedState{};
  state_.quality = SignalQuality::Medium;
  state_.qualityScore = 0.5;
  state_.qualityReasonMask = QualityReasonNoGps;
  kalman_ = KalmanState{};
  lastLocation_.reset();
  lastHeading_.reset();
  lastFixTimestampMs_.reset();
  lastImuTimestampMs_.reset();
  lastSpeedTimestampMs_.reset();
  movingSinceMs_.reset();
  stoppedSinceMs_.reset();
  totalSpeedSeconds_ = 0.0;
  totalTrackedSeconds_ = 0.0;
}

void SpeedEngine::setTripAccumulation(bool active) {
  options_.accumulateTrip = active;
  lastSpeedTimestampMs_.reset();
}

void SpeedEngine::setMountOffsetDegrees(double value) {
  options_.mountOffsetDegrees = finite(value) ? value : 0.0;
}

SpeedState SpeedEngine::onLocation(const LocationSample &sample) {
  if (!finite(sample.latitude) || !finite(sample.longitude) || !finite(sample.timestampMs)) {
    return state_;
  }

  state_.gpsAvailable = true;
  state_.timestampMs = sample.timestampMs;
  lastFixTimestampMs_ = sample.timestampMs;
  state_.nativeSpeedUsed = false;
  state_.hasGpsAccuracy = sample.hasAccuracy && finite(sample.accuracyMeters);
  state_.gpsAccuracyMeters = state_.hasGpsAccuracy ? sample.accuracyMeters : 0.0;

  if (!isGpsAccuracyAcceptable(sample)) {
    state_.quality = SignalQuality::Poor;
    updateDiagnostics(sample.timestampMs, QualityReasonPoorAccuracy);
    return state_;
  }

  const bool hasNativeSpeed =
      sample.hasNativeSpeed && finite(sample.nativeSpeedMps) && sample.nativeSpeedMps >= 0.0;
  state_.nativeSpeedUsed = hasNativeSpeed;

  bool hasMeasurement = hasNativeSpeed;
  bool hasDerivedMeasurement = false;
  double measurementMps = hasNativeSpeed ? sample.nativeSpeedMps : 0.0;
  double distanceMeters = 0.0;
  double dtSeconds = 0.0;

  if (lastLocation_.has_value()) {
    dtSeconds = (sample.timestampMs - lastLocation_->timestampMs) / 1000.0;
    if (dtSeconds > 0.0 && dtSeconds <= 10.0) {
      distanceMeters = haversineMeters(
          lastLocation_->latitude,
          lastLocation_->longitude,
          sample.latitude,
          sample.longitude);
      const double derivedSpeedMps = distanceMeters / dtSeconds;
      if (!hasNativeSpeed && finite(derivedSpeedMps) && derivedSpeedMps >= 0.0) {
        measurementMps = derivedSpeedMps;
        hasMeasurement = true;
        hasDerivedMeasurement = true;
      }
    }
  }

  if (hasMeasurement) {
    if (isOutlier(measurementMps, dtSeconds, hasNativeSpeed)) {
      state_.quality = SignalQuality::Poor;
      state_.source = SpeedSource::None;
      updateDiagnostics(
          sample.timestampMs,
          QualityReasonOutlierRejected | (hasNativeSpeed ? QualityReasonNativeSpeedUsed : 0));
      return state_;
    }

    const double clampedMeasurement = clampSpeed(measurementMps);
    const double filteredSpeed =
        updateKalman(clampedMeasurement, measurementNoise(sample, hasNativeSpeed));
    const double nextSpeed =
        (clampedMeasurement < options_.minMovingSpeedMps &&
         filteredSpeed < options_.minMovingSpeedMps)
            ? 0.0
            : clampSpeed(filteredSpeed);

    updateSpeedStats(nextSpeed, sample.timestampMs, options_.accumulateTrip);
    updateMovementFlags(nextSpeed, sample.timestampMs);
    state_.source = SpeedSource::Gps;

    if (lastLocation_.has_value() && hasDerivedMeasurement && options_.accumulateTrip &&
        isGpsAccuracyGoodForDistance(sample) && clampedMeasurement >= options_.minMovingSpeedMps) {
      state_.distanceMeters += distanceMeters;
    } else if (lastLocation_.has_value() && hasNativeSpeed && options_.accumulateTrip &&
               isGpsAccuracyGoodForDistance(sample) && clampedMeasurement >= options_.minMovingSpeedMps &&
               dtSeconds > 0.0) {
      state_.distanceMeters += distanceMeters;
    }
  }

  lastLocation_ = sample;
  updateHeading(sample.timestampMs);
  updateQuality(sample.timestampMs);
  updateDiagnostics(sample.timestampMs, hasNativeSpeed ? QualityReasonNativeSpeedUsed : 0);
  state_.stale = false;
  return state_;
}

SpeedState SpeedEngine::onHeading(const HeadingSample &sample) {
  if (sample.hasHeading && finite(sample.headingDegrees)) {
    lastHeading_ = sample;
    if (finite(sample.timestampMs)) {
      state_.timestampMs = sample.timestampMs;
      updateHeading(sample.timestampMs);
    } else {
      updateHeading(state_.timestampMs);
    }
  }
  return state_;
}

SpeedState SpeedEngine::onImu(const ImuSample &sample) {
  if (!finite(sample.timestampMs)) {
    return state_;
  }

  state_.motionAvailable = true;
  state_.timestampMs = sample.timestampMs;
  state_.nativeSpeedUsed = false;

  const auto previousImuTimestamp = lastImuTimestampMs_;
  lastImuTimestampMs_ = sample.timestampMs;
  if (!previousImuTimestamp.has_value() || !lastFixTimestampMs_.has_value()) {
    return checkStale(sample.timestampMs);
  }

  const double dtSeconds = (sample.timestampMs - previousImuTimestamp.value()) / 1000.0;
  if (dtSeconds <= 0.0 || dtSeconds > 1.0) {
    return checkStale(sample.timestampMs);
  }

  if (sample.timestampMs - lastFixTimestampMs_.value() >= options_.staleTimeoutMs) {
    return checkStale(sample.timestampMs);
  }

  const double acceleration = clamp(
      finite(sample.forwardAccelerationMps2) ? sample.forwardAccelerationMps2 : 0.0,
      -options_.maxForwardAccelerationMps2,
      options_.maxForwardAccelerationMps2);
  const double deltaSpeed = acceleration * dtSeconds;
  predictKalman(deltaSpeed, dtSeconds);

  double nextSpeed = clampSpeed(kalman_.value);
  if (nextSpeed < options_.minMovingSpeedMps && std::abs(acceleration) < 0.2) {
    nextSpeed = 0.0;
    kalman_.value = 0.0;
  }

  updateSpeedStats(nextSpeed, sample.timestampMs, options_.accumulateTrip);
  updateMovementFlags(nextSpeed, sample.timestampMs);
  state_.source = state_.source == SpeedSource::Gps || state_.source == SpeedSource::Blended
                      ? SpeedSource::Blended
                      : SpeedSource::MotionOnly;
  updateHeading(sample.timestampMs);
  updateQuality(sample.timestampMs);
  updateDiagnostics(sample.timestampMs, QualityReasonImuPredicted);
  return state_;
}

SpeedState SpeedEngine::checkStale(double timestampMs) {
  if (!finite(timestampMs)) {
    return state_;
  }

  state_.timestampMs = timestampMs;
  if (lastFixTimestampMs_.has_value() &&
      timestampMs - lastFixTimestampMs_.value() >= options_.staleTimeoutMs) {
    state_.stale = true;
    state_.quality = SignalQuality::Poor;
    state_.source = SpeedSource::None;
    kalman_.value = 0.0;
    updateSpeedStats(0.0, timestampMs, false);
    updateMovementFlags(0.0, timestampMs);
    updateHeading(timestampMs);
    updateDiagnostics(timestampMs, QualityReasonStale);
    return state_;
  }

  state_.stale = false;
  updateHeading(timestampMs);
  updateQuality(timestampMs);
  updateDiagnostics(timestampMs, 0);
  return state_;
}

const SpeedState &SpeedEngine::state() const {
  return state_;
}

double SpeedEngine::clampSpeed(double speedMps) const {
  if (!finite(speedMps)) {
    return 0.0;
  }
  return clamp(speedMps, 0.0, options_.maxSpeedMps);
}

double SpeedEngine::measurementNoise(const LocationSample &sample, bool nativeSpeed) const {
  if (nativeSpeed) {
    return 0.7;
  }
  if (!sample.hasAccuracy || !finite(sample.accuracyMeters)) {
    return 4.0;
  }
  return clamp(sample.accuracyMeters / 2.0, 1.0, 25.0);
}

void SpeedEngine::predictKalman(double deltaSpeedMps, double dtSeconds) {
  if (!kalman_.initialized) {
    kalman_.initialized = true;
    kalman_.value = 0.0;
    kalman_.covariance = 4.0;
  }
  kalman_.value = clampSpeed(kalman_.value + deltaSpeedMps);
  kalman_.covariance += std::max(0.05, dtSeconds * 6.0);
}

double SpeedEngine::updateKalman(double measurementMps, double noise) {
  if (!kalman_.initialized) {
    kalman_.initialized = true;
    kalman_.value = measurementMps;
    kalman_.covariance = 1.0;
    return clampSpeed(kalman_.value);
  }

  kalman_.covariance += 3.0;
  const double gain = kalman_.covariance / (kalman_.covariance + std::max(0.01, noise));
  kalman_.value = kalman_.value + gain * (measurementMps - kalman_.value);
  kalman_.covariance = (1.0 - gain) * kalman_.covariance;
  return clampSpeed(kalman_.value);
}

void SpeedEngine::updateSpeedStats(double speedMps, double timestampMs, bool accumulate) {
  state_.speedMps = clampSpeed(speedMps);
  state_.timestampMs = timestampMs;

  const auto previousTimestamp = lastSpeedTimestampMs_;
  lastSpeedTimestampMs_ = timestampMs;

  if (!accumulate) {
    return;
  }

  state_.maxSpeedMps = std::max(state_.maxSpeedMps, state_.speedMps);

  if (!previousTimestamp.has_value()) {
    return;
  }

  const double dtSeconds = (timestampMs - previousTimestamp.value()) / 1000.0;
  if (dtSeconds <= 0.0 || dtSeconds > 2.0) {
    return;
  }

  totalSpeedSeconds_ += state_.speedMps * dtSeconds;
  totalTrackedSeconds_ += dtSeconds;
  if (totalTrackedSeconds_ > 0.0) {
    state_.averageSpeedMps = totalSpeedSeconds_ / totalTrackedSeconds_;
  }
}

void SpeedEngine::updateMovementFlags(double speedMps, double timestampMs) {
  if (speedMps >= options_.minMovingSpeedMps) {
    if (!movingSinceMs_.has_value()) {
      movingSinceMs_ = timestampMs;
    }
    stoppedSinceMs_.reset();
    state_.isStopped = false;
    state_.isMoving = timestampMs - movingSinceMs_.value() >= options_.movingSustainMs;
    return;
  }

  movingSinceMs_.reset();
  state_.isMoving = false;
  if (!stoppedSinceMs_.has_value()) {
    stoppedSinceMs_ = timestampMs;
  }
  state_.isStopped = timestampMs - stoppedSinceMs_.value() >= options_.stoppedSustainMs;
}

void SpeedEngine::updateQuality(double timestampMs) {
  if (!lastFixTimestampMs_.has_value()) {
    state_.quality = SignalQuality::Medium;
    return;
  }

  const double ageSeconds = (timestampMs - lastFixTimestampMs_.value()) / 1000.0;
  const double accuracy = lastLocation_.has_value() && lastLocation_->hasAccuracy
                              ? lastLocation_->accuracyMeters
                              : options_.maxGpsAccuracyMeters;

  if (accuracy <= options_.maxGpsAccuracyMeters / 2.0 && ageSeconds <= 2.0) {
    state_.quality = SignalQuality::Good;
  } else if (accuracy <= options_.maxGpsAccuracyMeters && ageSeconds <= 5.0) {
    state_.quality = SignalQuality::Medium;
  } else {
    state_.quality = SignalQuality::Poor;
  }
}

SignalQuality SpeedEngine::headingQualityForAccuracy(
    bool hasAccuracy,
    double accuracyDegrees) const {
  if (!hasAccuracy || !finite(accuracyDegrees)) {
    return SignalQuality::Medium;
  }
  if (accuracyDegrees <= options_.maxHeadingAccuracyDegrees / 2.0) {
    return SignalQuality::Good;
  }
  if (accuracyDegrees <= options_.maxHeadingAccuracyDegrees) {
    return SignalQuality::Medium;
  }
  return SignalQuality::Poor;
}

bool SpeedEngine::hasUsableCourse(const LocationSample &sample) const {
  if (!sample.hasCourse || !finite(sample.courseDegrees)) {
    return false;
  }
  if (sample.courseDegrees < 0.0 || sample.courseDegrees >= 360.0) {
    return false;
  }
  return true;
}

bool SpeedEngine::hasUsableDeviceHeading(const HeadingSample &sample) const {
  if (!sample.hasHeading || !finite(sample.headingDegrees)) {
    return false;
  }
  return true;
}

void SpeedEngine::updateHeading(double timestampMs, int extraReasonMask) {
  int mask = extraReasonMask;
  const bool movingEnoughForCourse = state_.speedMps >= options_.minCourseSpeedMps;

  if (!movingEnoughForCourse && lastLocation_.has_value() && lastLocation_->hasCourse) {
    mask |= HeadingReasonLowSpeedCourseIgnored;
  }

  if (movingEnoughForCourse && lastLocation_.has_value() && hasUsableCourse(lastLocation_.value())) {
    const auto &sample = lastLocation_.value();
    state_.hasHeading = true;
    state_.headingAvailable = true;
    state_.headingDegrees = normalizeDegrees(sample.courseDegrees);
    state_.headingSource = HeadingSource::Course;
    state_.hasHeadingAccuracy =
        sample.hasCourseAccuracy && finite(sample.courseAccuracyDegrees);
    state_.headingAccuracyDegrees =
        state_.hasHeadingAccuracy ? sample.courseAccuracyDegrees : 0.0;
    state_.headingQuality = headingQualityForAccuracy(
        state_.hasHeadingAccuracy,
        state_.headingAccuracyDegrees);
    mask |= HeadingReasonCourseUsed;
    if (state_.headingQuality == SignalQuality::Poor) {
      mask |= HeadingReasonPoorHeadingAccuracy;
    }
    state_.headingReasonMask = mask;
    if (finite(timestampMs)) {
      state_.timestampMs = timestampMs;
    }
    return;
  }

  if (lastHeading_.has_value() && hasUsableDeviceHeading(lastHeading_.value())) {
    const auto &sample = lastHeading_.value();
    state_.hasHeading = true;
    state_.headingAvailable = true;
    state_.headingDegrees = normalizeDegrees(sample.headingDegrees + options_.mountOffsetDegrees);
    state_.headingSource = HeadingSource::Device;
    state_.hasHeadingAccuracy = sample.hasAccuracy && finite(sample.accuracyDegrees);
    state_.headingAccuracyDegrees =
        state_.hasHeadingAccuracy ? sample.accuracyDegrees : 0.0;
    state_.headingQuality = headingQualityForAccuracy(
        state_.hasHeadingAccuracy,
        state_.headingAccuracyDegrees);
    mask |= HeadingReasonDeviceHeadingUsed;
    if (state_.headingQuality == SignalQuality::Poor) {
      mask |= HeadingReasonPoorHeadingAccuracy;
    }
    state_.headingReasonMask = mask;
    if (finite(timestampMs)) {
      state_.timestampMs = timestampMs;
    }
    return;
  }

  state_.hasHeading = false;
  state_.headingAvailable = false;
  state_.headingSource = HeadingSource::None;
  state_.headingQuality = SignalQuality::Poor;
  state_.hasHeadingAccuracy = false;
  state_.headingAccuracyDegrees = 0.0;
  mask |= HeadingReasonNoHeading;
  if (lastHeading_.has_value() && lastHeading_->hasAccuracy &&
      finite(lastHeading_->accuracyDegrees) &&
      lastHeading_->accuracyDegrees > options_.maxHeadingAccuracyDegrees) {
    mask |= HeadingReasonPoorHeadingAccuracy;
  }
  if (lastLocation_.has_value() && lastLocation_->hasCourseAccuracy &&
      finite(lastLocation_->courseAccuracyDegrees) &&
      lastLocation_->courseAccuracyDegrees > options_.maxHeadingAccuracyDegrees) {
    mask |= HeadingReasonPoorHeadingAccuracy;
  }
  state_.headingReasonMask = mask;
}

void SpeedEngine::updateDiagnostics(double timestampMs, int extraReasonMask) {
  int mask = extraReasonMask;

  if (!lastFixTimestampMs_.has_value()) {
    mask |= QualityReasonNoGps;
    state_.hasFixAge = false;
    state_.fixAgeMs = 0.0;
  } else {
    state_.hasFixAge = true;
    state_.fixAgeMs = std::max(0.0, timestampMs - lastFixTimestampMs_.value());
  }

  if (state_.stale) {
    mask |= QualityReasonStale;
  }

  if (lastLocation_.has_value() && lastLocation_->hasAccuracy &&
      finite(lastLocation_->accuracyMeters) &&
      lastLocation_->accuracyMeters > options_.maxGpsAccuracyMeters) {
    mask |= QualityReasonPoorAccuracy;
  }

  if (state_.nativeSpeedUsed) {
    mask |= QualityReasonNativeSpeedUsed;
  }

  double score = 0.65;
  switch (state_.quality) {
    case SignalQuality::Good:
      score = 0.95;
      break;
    case SignalQuality::Medium:
      score = 0.65;
      break;
    case SignalQuality::Poor:
      score = 0.25;
      break;
  }

  if ((mask & QualityReasonNativeSpeedUsed) != 0) {
    score += 0.03;
  }
  if ((mask & QualityReasonImuPredicted) != 0) {
    score -= 0.10;
  }
  if ((mask & QualityReasonOutlierRejected) != 0) {
    score -= 0.25;
  }
  if ((mask & QualityReasonPoorAccuracy) != 0) {
    score -= 0.20;
  }
  if ((mask & QualityReasonStale) != 0 || (mask & QualityReasonNoGps) != 0) {
    score -= 0.35;
  }

  state_.qualityScore = clamp(score, 0.0, 1.0);
  state_.qualityReasonMask = mask;
}

bool SpeedEngine::isGpsAccuracyAcceptable(const LocationSample &sample) const {
  if (!sample.hasAccuracy || !finite(sample.accuracyMeters)) {
    return true;
  }
  return sample.accuracyMeters <= options_.maxGpsAccuracyMeters * 2.0;
}

bool SpeedEngine::isGpsAccuracyGoodForDistance(const LocationSample &sample) const {
  if (!sample.hasAccuracy || !finite(sample.accuracyMeters)) {
    return true;
  }
  return sample.accuracyMeters <= options_.maxGpsAccuracyMeters;
}

bool SpeedEngine::isOutlier(double measurementMps, double dtSeconds, bool nativeSpeed) const {
  if (!finite(measurementMps) || measurementMps < 0.0) {
    return true;
  }
  if (measurementMps > options_.maxSpeedMps) {
    return true;
  }
  if (nativeSpeed || dtSeconds <= 0.0 || !kalman_.initialized) {
    return false;
  }
  const double acceleration = std::abs(measurementMps - state_.speedMps) / dtSeconds;
  return acceleration > options_.maxOutlierAccelerationMps2 && measurementMps > 5.0;
}

} // namespace v3l0city
