import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';

import {
  DEFAULT_KALMAN_OPTIONS,
  LOCATION_DISTANCE_INTERVAL_METERS,
  LOCATION_UPDATE_INTERVAL_MS,
  MAX_FORWARD_ACCELERATION_MPS2,
  MAX_GPS_ACCURACY_METERS,
  MAX_MOTION_SAMPLE_GAP_SECONDS,
  MAX_SPEED_SAMPLE_GAP_SECONDS,
  MIN_MOVING_SPEED_MPS,
  MOTION_UPDATE_INTERVAL_MS,
} from '../utils/constants';
import { calculateDistance, type Units } from '../utils/speedMath';
import {
  getForwardAcceleration,
  normalizeHeadingDegrees,
} from '../utils/motionMath';
import { useKalmanSpeedFilter } from './useKalmanSpeedFilter';
import {
  isMotionSampleUsable,
  sanitizeSpeed,
  shouldUseGpsSample,
} from '../utils/sensorGuards';
import { logSensorWarning } from '../utils/logging';

type PermissionState = 'unknown' | 'requesting' | 'granted' | 'denied';

export type SensorStatus =
  | 'initializing'
  | 'ready'
  | 'permission_denied'
  | 'sensor_unavailable'
  | 'error';

export type SignalQuality = 'good' | 'medium' | 'poor';

export type SpeedSource = 'none' | 'gps' | 'blended' | 'motion-only';

export type VelocityStats = {
  speedMps: number;
  averageSpeedMps: number;
  maxSpeedMps: number;
  distanceMeters: number;
};

export type VelocitySensorsState = VelocityStats & {
  headingDegrees: number | null;
  permission: PermissionState;
  status: SensorStatus;
  quality: SignalQuality;
  source: SpeedSource;
  errorMessage: string | null;
  units: Units;
  motionAvailable: boolean;
  gpsAvailable: boolean;
  headingAvailable: boolean;
};

type UseVelocitySensorsOptions = {
  mountOffsetDegrees: number;
  kalmanOptions?: typeof DEFAULT_KALMAN_OPTIONS;
};

const initialStats: VelocityStats = {
  speedMps: 0,
  averageSpeedMps: 0,
  maxSpeedMps: 0,
  distanceMeters: 0,
};

const getSignalQuality = (
  accuracyMeters: number | null | undefined,
  timeSinceLastFixSeconds: number
): SignalQuality => {
  if (accuracyMeters == null) {
    return 'medium';
  }

  if (accuracyMeters <= MAX_GPS_ACCURACY_METERS / 2 && timeSinceLastFixSeconds <= 2) {
    return 'good';
  }

  if (accuracyMeters <= MAX_GPS_ACCURACY_METERS && timeSinceLastFixSeconds <= 5) {
    return 'medium';
  }

  return 'poor';
};

export const useVelocitySensors = ({
  mountOffsetDegrees,
  kalmanOptions = DEFAULT_KALMAN_OPTIONS,
}: UseVelocitySensorsOptions) => {
  const [stats, setStats] = useState<VelocityStats>(initialStats);
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [status, setStatus] = useState<SensorStatus>('initializing');
  const [quality, setQuality] = useState<SignalQuality>('medium');
  const [source, setSource] = useState<SpeedSource>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [gpsAvailable, setGpsAvailable] = useState<boolean>(false);
  const [motionAvailable, setMotionAvailable] = useState<boolean>(false);
  const [headingAvailable, setHeadingAvailable] = useState<boolean>(false);

  const [units] = useState<Units>('km/h');

  const mountOffsetRef = useRef<number>(mountOffsetDegrees);
  const lastLocationRef = useRef<Location.LocationObjectCoords | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const lastMotionTimestampRef = useRef<number | null>(null);
  const lastSpeedSampleTimestampRef = useRef<number | null>(null);
  const lastAccuracyRef = useRef<number | null | undefined>(null);
  const lastFixTimestampRef = useRef<number | null>(null);
  const headingRef = useRef<number | null>(null);
  const totalSpeedSecondsRef = useRef(0);
  const totalTimeSecondsRef = useRef(0);

  const { filterSpeed, predictSpeed, resetFilter } =
    useKalmanSpeedFilter(kalmanOptions);

  useEffect(() => {
    mountOffsetRef.current = mountOffsetDegrees;
  }, [mountOffsetDegrees]);

  const updateSpeedStats = (nextSpeedMps: number, timestampMs: number) => {
    const lastSample = lastSpeedSampleTimestampRef.current;
    lastSpeedSampleTimestampRef.current = timestampMs;

    setStats((prev) => {
      const nextMax = Math.max(prev.maxSpeedMps, nextSpeedMps);

      if (lastSample == null) {
        return {
          ...prev,
          speedMps: nextSpeedMps,
          maxSpeedMps: nextMax,
        };
      }

      const timeDiff = (timestampMs - lastSample) / 1000;
      if (timeDiff <= 0 || timeDiff > MAX_SPEED_SAMPLE_GAP_SECONDS) {
        return {
          ...prev,
          speedMps: nextSpeedMps,
          maxSpeedMps: nextMax,
        };
      }

      totalSpeedSecondsRef.current += nextSpeedMps * timeDiff;
      totalTimeSecondsRef.current += timeDiff;

      const averageSpeedMps =
        totalTimeSecondsRef.current > 0
          ? totalSpeedSecondsRef.current / totalTimeSecondsRef.current
          : 0;

      return {
        ...prev,
        speedMps: nextSpeedMps,
        maxSpeedMps: nextMax,
        averageSpeedMps,
      };
    });
  };

  const reset = () => {
    lastLocationRef.current = null;
    lastTimestampRef.current = null;
    lastMotionTimestampRef.current = null;
    lastSpeedSampleTimestampRef.current = null;
    lastAccuracyRef.current = null;
    lastFixTimestampRef.current = null;
    headingRef.current = null;
    totalSpeedSecondsRef.current = 0;
    totalTimeSecondsRef.current = 0;
    setStats(initialStats);
    setHeadingDegrees(null);
    setStatus('initializing');
    setSource('none');
    setErrorMessage(null);
    setGpsAvailable(false);
    setMotionAvailable(false);
    setHeadingAvailable(false);
    resetFilter();
  };

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let headingSubscription: Location.LocationSubscription | null = null;
    let motionSubscription: { remove: () => void } | null = null;
    let isMounted = true;

    const start = async () => {
      try {
        setPermission('requesting');
        const { status: locationStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }
        if (locationStatus !== 'granted') {
          setPermission('denied');
          setStatus('permission_denied');
          setErrorMessage('Permission to access location was denied');
          logSensorWarning('Location permission denied');
          return;
        }

        setPermission('granted');
        setStatus('initializing');

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: LOCATION_UPDATE_INTERVAL_MS,
            distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
          },
          (location) => {
            const { coords, timestamp } = location;
            const lastLocation = lastLocationRef.current;
            const lastTimestamp = lastTimestampRef.current;

            lastAccuracyRef.current = coords.accuracy;
            lastFixTimestampRef.current = timestamp;

            if (lastLocation && lastTimestamp) {
              const distanceDelta = calculateDistance(lastLocation, coords);
              const timeDiff = (timestamp - lastTimestamp) / 1000;

              if (shouldUseGpsSample(coords, timeDiff)) {
                const derivedSpeed =
                  timeDiff > 0 ? distanceDelta / timeDiff : 0;
                const rawSpeedMps =
                  coords.speed == null ? derivedSpeed : coords.speed;
                const gpsSpeedMps = sanitizeSpeed(rawSpeedMps, derivedSpeed);

                const filteredSpeedMps = filterSpeed(
                  gpsSpeedMps,
                  coords.accuracy,
                  timeDiff
                );

                updateSpeedStats(filteredSpeedMps, timestamp);

                const accuracyOk =
                  coords.accuracy == null ||
                  coords.accuracy <= MAX_GPS_ACCURACY_METERS;
                if (accuracyOk && gpsSpeedMps >= MIN_MOVING_SPEED_MPS) {
                  setStats((prev) => ({
                    ...prev,
                    distanceMeters: prev.distanceMeters + distanceDelta,
                  }));
                }

                setSource('gps');
              }
            } else {
              // First fix; mark GPS as available even before we can derive speed
              setGpsAvailable(true);
            }

            lastLocationRef.current = coords;
            lastTimestampRef.current = timestamp;
            setStatus('ready');
            setGpsAvailable(true);
          }
        );

        try {
          // On some Android devices/emulators, DeviceMotion can trigger native
          // context/display errors. Treat motion as an optional enhancement and
          // only enable it on iOS for now.
          if (Platform.OS === 'ios') {
            const motionSupported = await DeviceMotion.isAvailableAsync();
            if (motionSupported) {
              await DeviceMotion.requestPermissionsAsync();
              DeviceMotion.setUpdateInterval(MOTION_UPDATE_INTERVAL_MS);
              motionSubscription = DeviceMotion.addListener((motionData) => {
              const acceleration = motionData.acceleration;
              if (!acceleration) {
                return;
              }

              const now = Date.now();
              const lastMotion = lastMotionTimestampRef.current;
              lastMotionTimestampRef.current = now;
              if (!lastMotion) {
                return;
              }

              const timeDiff = (now - lastMotion) / 1000;
              if (
                !isMotionSampleUsable(
                  timeDiff,
                  MAX_MOTION_SAMPLE_GAP_SECONDS
                )
              ) {
                return;
              }

              const adjustedHeading =
                headingRef.current != null
                  ? normalizeHeadingDegrees(
                      headingRef.current + mountOffsetRef.current
                    )
                  : null;
              const forwardAcceleration = getForwardAcceleration(
                acceleration,
                motionData.orientation,
                motionData.rotation,
                adjustedHeading
              );
              const clampedAcceleration = Math.max(
                -MAX_FORWARD_ACCELERATION_MPS2,
                Math.min(
                  MAX_FORWARD_ACCELERATION_MPS2,
                  forwardAcceleration
                )
              );
              const deltaSpeed = clampedAcceleration * timeDiff;
              const predictedSpeed = predictSpeed(deltaSpeed);
              updateSpeedStats(predictedSpeed, now);
              setSource((prev) =>
                prev === 'gps' ? 'blended' : 'motion-only'
              );
            });
            setMotionAvailable(true);
          }
        } catch {
          // Motion is optional; do not fail the whole sensor pipeline.
        }

        try {
          headingSubscription = await Location.watchHeadingAsync(
            (headingData) => {
              const nextHeading =
                headingData.trueHeading >= 0
                  ? headingData.trueHeading
                  : headingData.magHeading;
              headingRef.current = nextHeading;
              const adjusted = normalizeHeadingDegrees(
                nextHeading + mountOffsetRef.current
              );
              setHeadingDegrees(adjusted);
              setHeadingAvailable(true);
            }
          );
        } catch {
          headingRef.current = null;
          setHeadingDegrees(null);
          setHeadingAvailable(false);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setStatus('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Unexpected sensor error'
        );
      }
    };

    start();

    return () => {
      isMounted = false;
      locationSubscription?.remove();
      headingSubscription?.remove();
      motionSubscription?.remove();
    };
  }, [kalmanOptions]);

  useEffect(() => {
    const interval = setInterval(() => {
      const lastFix = lastFixTimestampRef.current;
      const lastAccuracy = lastAccuracyRef.current;
      if (!lastFix) {
        return;
      }
      const now = Date.now();
      const seconds = (now - lastFix) / 1000;
      setQuality(getSignalQuality(lastAccuracy, seconds));
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const state: VelocitySensorsState = useMemo(
    () => ({
      ...stats,
      headingDegrees,
      permission,
      status,
      quality,
      source,
      errorMessage,
      units,
      motionAvailable,
      gpsAvailable,
      headingAvailable,
    }),
    [
      stats,
      headingDegrees,
      permission,
      status,
      quality,
      source,
      errorMessage,
      units,
      motionAvailable,
      gpsAvailable,
      headingAvailable,
    ]
  );

  return {
    state,
    reset,
  };
};

