#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface V3l0citySpeedEngineWrapper : NSObject

- (void)setOptionsWithStaleTimeoutMs:(double)staleTimeoutMs
                        outputRateHz:(double)outputRateHz
                   mountOffsetDegrees:(double)mountOffsetDegrees
                       accumulateTrip:(BOOL)accumulateTrip;
- (NSDictionary *)reset;
- (void)setTripAccumulation:(BOOL)active;
- (void)setMountOffsetDegrees:(double)value;
- (NSDictionary *)onLocationWithLatitude:(double)latitude
                                longitude:(double)longitude
                           accuracyMeters:(double)accuracyMeters
                           nativeSpeedMps:(double)nativeSpeedMps
                              timestampMs:(double)timestampMs
                            courseDegrees:(double)courseDegrees
                     courseAccuracyDegrees:(double)courseAccuracyDegrees;
- (NSDictionary *)onHeadingWithDegrees:(double)headingDegrees
                            timestampMs:(double)timestampMs
                       accuracyDegrees:(double)accuracyDegrees;
- (NSDictionary *)onImuWithForwardAcceleration:(double)forwardAccelerationMps2
                                   timestampMs:(double)timestampMs;
- (NSDictionary *)checkStaleAtTimestampMs:(double)timestampMs;
- (NSDictionary *)currentState;

@end

NS_ASSUME_NONNULL_END
