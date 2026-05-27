#pragma once

#include <optional>

namespace v3l0city {

enum class SpeedSource {
  None = 0,
  Gps = 1,
  Blended = 2,
  MotionOnly = 3,
};

enum class SignalQuality {
  Good = 0,
  Medium = 1,
  Poor = 2,
};

enum class HeadingSource {
  None = 0,
  Course = 1,
  Device = 2,
};

enum QualityReasonMask {
  QualityReasonStale = 1 << 0,
  QualityReasonPoorAccuracy = 1 << 1,
  QualityReasonOutlierRejected = 1 << 2,
  QualityReasonImuPredicted = 1 << 3,
  QualityReasonNoGps = 1 << 4,
  QualityReasonNativeSpeedUsed = 1 << 5,
};

enum HeadingReasonMask {
  HeadingReasonCourseUsed = 1 << 0,
  HeadingReasonDeviceHeadingUsed = 1 << 1,
  HeadingReasonLowSpeedCourseIgnored = 1 << 2,
  HeadingReasonPoorHeadingAccuracy = 1 << 3,
  HeadingReasonNoHeading = 1 << 4,
  HeadingReasonPreciseLocationRequired = 1 << 5,
};

struct EngineOptions {
  double staleTimeoutMs = 3000.0;
  double outputRateHz = 10.0;
  double mountOffsetDegrees = 0.0;
  double maxGpsAccuracyMeters = 25.0;
  double maxHeadingAccuracyDegrees = 45.0;
  double minCourseSpeedMps = 1.5;
  double minMovingSpeedMps = 0.5;
  double maxSpeedMps = 80.0;
  double maxForwardAccelerationMps2 = 6.0;
  double maxOutlierAccelerationMps2 = 12.0;
  double movingSustainMs = 2500.0;
  double stoppedSustainMs = 2500.0;
  bool accumulateTrip = true;
};

struct LocationSample {
  double latitude = 0.0;
  double longitude = 0.0;
  double accuracyMeters = 0.0;
  bool hasAccuracy = false;
  double nativeSpeedMps = 0.0;
  bool hasNativeSpeed = false;
  double timestampMs = 0.0;
  double courseDegrees = 0.0;
  bool hasCourse = false;
  double courseAccuracyDegrees = 0.0;
  bool hasCourseAccuracy = false;
};

struct HeadingSample {
  double headingDegrees = 0.0;
  bool hasHeading = false;
  double timestampMs = 0.0;
  double accuracyDegrees = 0.0;
  bool hasAccuracy = false;
};

struct ImuSample {
  double forwardAccelerationMps2 = 0.0;
  double timestampMs = 0.0;
};

struct SpeedState {
  double speedMps = 0.0;
  double averageSpeedMps = 0.0;
  double maxSpeedMps = 0.0;
  double distanceMeters = 0.0;
  double headingDegrees = 0.0;
  bool hasHeading = false;
  SpeedSource source = SpeedSource::None;
  SignalQuality quality = SignalQuality::Medium;
  bool isMoving = false;
  bool isStopped = false;
  bool stale = false;
  bool gpsAvailable = false;
  bool motionAvailable = false;
  bool headingAvailable = false;
  double timestampMs = 0.0;
  double qualityScore = 0.5;
  int qualityReasonMask = QualityReasonNoGps;
  double gpsAccuracyMeters = 0.0;
  bool hasGpsAccuracy = false;
  double fixAgeMs = 0.0;
  bool hasFixAge = false;
  bool nativeSpeedUsed = false;
  HeadingSource headingSource = HeadingSource::None;
  SignalQuality headingQuality = SignalQuality::Poor;
  double headingAccuracyDegrees = 0.0;
  bool hasHeadingAccuracy = false;
  int headingReasonMask = HeadingReasonNoHeading;
};

class SpeedEngine {
public:
  SpeedEngine();

  void setOptions(const EngineOptions &options);
  const EngineOptions &options() const;

  void reset();
  void setTripAccumulation(bool active);
  void setMountOffsetDegrees(double value);

  SpeedState onLocation(const LocationSample &sample);
  SpeedState onHeading(const HeadingSample &sample);
  SpeedState onImu(const ImuSample &sample);
  SpeedState checkStale(double timestampMs);

  const SpeedState &state() const;

private:
  struct KalmanState {
    bool initialized = false;
    double value = 0.0;
    double covariance = 1.0;
  };

  EngineOptions options_;
  SpeedState state_;
  KalmanState kalman_;
  std::optional<LocationSample> lastLocation_;
  std::optional<HeadingSample> lastHeading_;
  std::optional<double> lastFixTimestampMs_;
  std::optional<double> lastImuTimestampMs_;
  std::optional<double> lastSpeedTimestampMs_;
  std::optional<double> movingSinceMs_;
  std::optional<double> stoppedSinceMs_;
  double totalSpeedSeconds_ = 0.0;
  double totalTrackedSeconds_ = 0.0;

  double clampSpeed(double speedMps) const;
  double measurementNoise(const LocationSample &sample, bool nativeSpeed) const;
  void predictKalman(double deltaSpeedMps, double dtSeconds);
  double updateKalman(double measurementMps, double measurementNoise);
  void updateSpeedStats(double speedMps, double timestampMs, bool accumulate);
  void updateMovementFlags(double speedMps, double timestampMs);
  void updateQuality(double timestampMs);
  void updateDiagnostics(double timestampMs, int extraReasonMask);
  void updateHeading(double timestampMs, int extraReasonMask = 0);
  SignalQuality headingQualityForAccuracy(bool hasAccuracy, double accuracyDegrees) const;
  bool hasUsableCourse(const LocationSample &sample) const;
  bool hasUsableDeviceHeading(const HeadingSample &sample) const;
  bool isGpsAccuracyAcceptable(const LocationSample &sample) const;
  bool isGpsAccuracyGoodForDistance(const LocationSample &sample) const;
  bool isOutlier(double measurementMps, double dtSeconds, bool nativeSpeed) const;
};

double haversineMeters(double latitudeA, double longitudeA, double latitudeB, double longitudeB);
double normalizeDegrees(double degrees);

} // namespace v3l0city
