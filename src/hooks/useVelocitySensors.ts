import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import * as NativeSpeedEngine from 'v3l0city-speed-engine';
import type {
  SpeedErrorEvent,
  SpeedUpdateEvent,
} from 'v3l0city-speed-engine';

import {
  AUTO_START_MOTION_SUSTAIN_SECONDS,
  AUTO_STOP_MOTION_SUSTAIN_SECONDS,
  DEFAULT_KALMAN_OPTIONS,
  GPS_DERIVED_SPEED_BLEND,
  GPS_NATIVE_SPEED_BLEND,
  LOCATION_DISTANCE_INTERVAL_METERS,
  LOCATION_STALE_TIMEOUT_MS,
  LOCATION_UPDATE_INTERVAL_MS,
  MAX_FORWARD_ACCELERATION_MPS2,
  MAX_GPS_ACCURACY_METERS,
  MAX_MOTION_SAMPLE_GAP_SECONDS,
  MAX_SPEED_SAMPLE_GAP_SECONDS,
  MIN_MOVING_SPEED_MPS,
  MOTION_UPDATE_INTERVAL_MS,
  RESPONSIVE_SPEED_DELTA_MPS,
} from '../utils/constants';
import { calculateDistance, type Units } from '../utils/speedMath';
import {
  getForwardAcceleration,
  normalizeHeadingDegrees,
} from '../utils/motionMath';
import { useKalmanSpeedFilter } from './useKalmanSpeedFilter';
import {
  isNativeSpeedUsable,
  isMotionSampleUsable,
  sanitizeSpeed,
  shouldUseGpsSample,
} from '../utils/sensorGuards';
import { logSensorWarning } from '../utils/logging';
import {
  getNativeSpeedErrorMessage,
  getUserFacingErrorMessage,
} from '../utils/userFacingErrors';

type PermissionState =
  | 'unknown'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'precise_required';

export type SensorStatus =
  | 'initializing'
  | 'ready'
  | 'permission_denied'
  | 'precise_location_required'
  | 'sensor_unavailable'
  | 'error';

export type SignalQuality = 'good' | 'medium' | 'poor';

export type SpeedSource = 'none' | 'gps' | 'blended' | 'motion-only';
export type HeadingSource = 'none' | 'course' | 'device';

export type VelocityStats = {
  speedMps: number;
  averageSpeedMps: number;
  maxSpeedMps: number;
  distanceMeters: number;
};

export type VelocitySensorsState = VelocityStats & {
  headingDegrees: number | null;
  headingSource: HeadingSource;
  headingAccuracyDegrees: number | null;
  headingQuality: SignalQuality;
  headingReasons: string[];
  permission: PermissionState;
  status: SensorStatus;
  quality: SignalQuality;
  source: SpeedSource;
  errorMessage: string | null;
  units: Units;
  stale: boolean;
  timestampMs: number;
  qualityScore: number;
  qualityReasons: string[];
  gpsAccuracyMeters: number | null;
  fixAgeMs: number | null;
  nativeSpeedUsed: boolean;
  motionAvailable: boolean;
  gpsAvailable: boolean;
  headingAvailable: boolean;
  isMoving: boolean;
  isStopped: boolean;
};

type UseVelocitySensorsOptions = {
  mountOffsetDegrees: number;
  kalmanOptions?: typeof DEFAULT_KALMAN_OPTIONS;
  /** When false (trip paused), only speedMps is updated for display; distance and max/average are not accumulated. */
  accumulateTrip?: boolean;
  /** Dev-only synthetic drive profile for emulator/simulator testing. */
  simulationEnabled?: boolean;
};

const initialStats: VelocityStats = {
  speedMps: 0,
  averageSpeedMps: 0,
  maxSpeedMps: 0,
  distanceMeters: 0,
};

const SIMULATED_DRIVE_TICK_MS = 100;
const SIMULATED_DRIVE_LOOP_SECONDS = 62;
const CITY_SPEED_MPS = 13.4; // ~30 mph
const SLOW_ROLL_SPEED_MPS = 5.4; // ~12 mph
const HIGHWAY_SPEED_MPS = 24.6; // ~55 mph

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const easeInOut = (amount: number) => {
  const clamped = Math.max(0, Math.min(1, amount));
  return clamped * clamped * (3 - 2 * clamped);
};

const getSimulatedSpeedMps = (elapsedSeconds: number) => {
  const t = elapsedSeconds % SIMULATED_DRIVE_LOOP_SECONDS;

  if (t < 1.5) return 0;
  if (t < 7.5) return lerp(0, CITY_SPEED_MPS, easeInOut((t - 1.5) / 6));
  if (t < 18) return CITY_SPEED_MPS + Math.sin(t * 1.7) * 0.7;
  if (t < 24) {
    return lerp(CITY_SPEED_MPS, SLOW_ROLL_SPEED_MPS, easeInOut((t - 18) / 6));
  }
  if (t < 29) return SLOW_ROLL_SPEED_MPS + Math.sin(t * 1.2) * 0.35;
  if (t < 36) {
    return lerp(SLOW_ROLL_SPEED_MPS, HIGHWAY_SPEED_MPS, easeInOut((t - 29) / 7));
  }
  if (t < 50) return HIGHWAY_SPEED_MPS + Math.sin(t * 0.9) * 1.2;
  if (t < 57) return lerp(HIGHWAY_SPEED_MPS, 0, easeInOut((t - 50) / 7));
  return 0;
};

const getSimulatedHeadingDegrees = (elapsedSeconds: number) =>
  normalizeHeadingDegrees(
    32 + elapsedSeconds * 2.8 + Math.sin(elapsedSeconds / 6) * 24
  );

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

const getHeadingQuality = (
  accuracyDegrees: number | null | undefined
): SignalQuality => {
  if (accuracyDegrees == null) {
    return 'medium';
  }
  if (accuracyDegrees <= 22.5) {
    return 'good';
  }
  if (accuracyDegrees <= 45) {
    return 'medium';
  }
  return 'poor';
};

export const useVelocitySensors = ({
  mountOffsetDegrees,
  kalmanOptions = DEFAULT_KALMAN_OPTIONS,
  accumulateTrip = true,
  simulationEnabled = false,
}: UseVelocitySensorsOptions) => {
  const [stats, setStats] = useState<VelocityStats>(initialStats);
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);
  const [headingSource, setHeadingSource] = useState<HeadingSource>('none');
  const [headingAccuracyDegrees, setHeadingAccuracyDegrees] = useState<
    number | null
  >(null);
  const [headingQuality, setHeadingQuality] =
    useState<SignalQuality>('poor');
  const [headingReasons, setHeadingReasons] =
    useState<string[]>(['no-heading']);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [status, setStatus] = useState<SensorStatus>('initializing');
  const [quality, setQuality] = useState<SignalQuality>('medium');
  const [source, setSource] = useState<SpeedSource>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [timestampMs, setTimestampMs] = useState(0);
  const [qualityScore, setQualityScore] = useState(0.5);
  const [qualityReasons, setQualityReasons] = useState<string[]>(['no-gps']);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [fixAgeMs, setFixAgeMs] = useState<number | null>(null);
  const [nativeSpeedUsed, setNativeSpeedUsed] = useState(false);

  const [gpsAvailable, setGpsAvailable] = useState<boolean>(false);
  const [motionAvailable, setMotionAvailable] = useState<boolean>(false);
  const [headingAvailable, setHeadingAvailable] = useState<boolean>(false);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);

  const [units] = useState<Units>('km/h');
  const nativeEngineActiveRef = useRef(false);
  const accumulateTripRef = useRef(accumulateTrip);
  useEffect(() => {
    accumulateTripRef.current = accumulateTrip;
    if (nativeEngineActiveRef.current) {
      void NativeSpeedEngine.setTripAccumulation(accumulateTrip).catch((error) => {
        logSensorWarning(
          `Native speed engine trip accumulation error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
    }
  }, [accumulateTrip]);

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
  const firstAboveThresholdAtRef = useRef<number | null>(null);
  const firstBelowThresholdAtRef = useRef<number | null>(null);
  const speedMpsRef = useRef(0);
  const simulatedDriveStartedAtRef = useRef<number | null>(null);

  const { filterSpeed, predictSpeed, resetFilter } =
    useKalmanSpeedFilter(kalmanOptions);

  const shouldUseNativeEngine = useMemo(
    () =>
      (Platform.OS === 'ios' || Platform.OS === 'android') &&
      NativeSpeedEngine.isAvailable(),
    []
  );

  useEffect(() => {
    mountOffsetRef.current = mountOffsetDegrees;
    if (nativeEngineActiveRef.current) {
      void NativeSpeedEngine.setMountOffsetDegrees(mountOffsetDegrees).catch(
        (error) => {
          logSensorWarning(
            `Native speed engine mount offset error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      );
    }
  }, [mountOffsetDegrees]);

  const updateSpeedStats = (
    nextSpeedMps: number,
    timestampMs: number,
    options?: { accumulate?: boolean }
  ) => {
    const accumulate = options?.accumulate !== false;

    const lastSample = lastSpeedSampleTimestampRef.current;
    lastSpeedSampleTimestampRef.current = timestampMs;
    setTimestampMs(timestampMs);

    setStats((prev) => {
      const nextMax = accumulate ? Math.max(prev.maxSpeedMps, nextSpeedMps) : prev.maxSpeedMps;

      if (!accumulate) {
        return { ...prev, speedMps: nextSpeedMps };
      }

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
    firstAboveThresholdAtRef.current = null;
    firstBelowThresholdAtRef.current = null;
    speedMpsRef.current = 0;
    simulatedDriveStartedAtRef.current = Date.now();
    setStats(initialStats);
    setHeadingDegrees(null);
    setHeadingSource('none');
    setHeadingAccuracyDegrees(null);
    setHeadingQuality('poor');
    setHeadingReasons(['no-heading']);
    setStatus('initializing');
    setSource('none');
    setErrorMessage(null);
    setStale(false);
    setTimestampMs(0);
    setQualityScore(0.5);
    setQualityReasons(['no-gps']);
    setGpsAccuracyMeters(null);
    setFixAgeMs(null);
    setNativeSpeedUsed(false);
    setGpsAvailable(false);
    setMotionAvailable(false);
    setHeadingAvailable(false);
    setIsMoving(false);
    setIsStopped(false);
    resetFilter();
    if (nativeEngineActiveRef.current) {
      void NativeSpeedEngine.reset().catch((error) => {
        logSensorWarning(
          `Native speed engine reset error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
    }
  };

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let headingSubscription: Location.LocationSubscription | null = null;
    let motionSubscription: { remove: () => void } | null = null;
    let nativeUpdateSubscription: { remove: () => void } | null = null;
    let nativeErrorSubscription: { remove: () => void } | null = null;
    let isMounted = true;

    const applySimulatedDriveUpdate = () => {
      const now = Date.now();
      if (simulatedDriveStartedAtRef.current == null) {
        simulatedDriveStartedAtRef.current = now;
      }

      const elapsedSeconds =
        (now - simulatedDriveStartedAtRef.current) / 1000;
      const nextSpeedMps = getSimulatedSpeedMps(elapsedSeconds);
      const nextHeading = getSimulatedHeadingDegrees(elapsedSeconds);
      const lastSample = lastSpeedSampleTimestampRef.current;
      const previousSpeedMps = speedMpsRef.current;
      const timeDiff =
        lastSample == null ? 0 : Math.max(0, (now - lastSample) / 1000);
      const canIntegrate =
        timeDiff > 0 && timeDiff <= MAX_SPEED_SAMPLE_GAP_SECONDS;
      const accumulate = accumulateTripRef.current;

      lastSpeedSampleTimestampRef.current = now;
      lastFixTimestampRef.current = now;
      lastAccuracyRef.current = 3;
      speedMpsRef.current = nextSpeedMps;

      setTimestampMs(now);
      setPermission('granted');
      setStatus('ready');
      setQuality('good');
      setSource('blended');
      setErrorMessage(null);
      setStale(false);
      setHeadingDegrees(nextHeading);
      setHeadingSource(nextSpeedMps >= MIN_MOVING_SPEED_MPS ? 'course' : 'device');
      setHeadingAccuracyDegrees(nextSpeedMps >= MIN_MOVING_SPEED_MPS ? 3 : 12);
      setHeadingQuality('good');
      setHeadingReasons(
        nextSpeedMps >= MIN_MOVING_SPEED_MPS
          ? ['course-used']
          : ['low-speed-course-ignored', 'device-heading-used']
      );
      setGpsAccuracyMeters(3);
      setFixAgeMs(0);
      setQualityScore(0.98);
      setQualityReasons(['simulated-drive']);
      setNativeSpeedUsed(false);
      setGpsAvailable(true);
      setMotionAvailable(true);
      setHeadingAvailable(true);

      setStats((prev) => {
        const nextMax = accumulate
          ? Math.max(prev.maxSpeedMps, nextSpeedMps)
          : prev.maxSpeedMps;

        if (!accumulate || !canIntegrate) {
          return {
            ...prev,
            speedMps: nextSpeedMps,
            maxSpeedMps: nextMax,
          };
        }

        const distanceDelta =
          ((previousSpeedMps + nextSpeedMps) / 2) * timeDiff;
        totalSpeedSecondsRef.current += distanceDelta;
        totalTimeSecondsRef.current += timeDiff;

        return {
          ...prev,
          speedMps: nextSpeedMps,
          maxSpeedMps: nextMax,
          distanceMeters: prev.distanceMeters + distanceDelta,
          averageSpeedMps:
            totalTimeSecondsRef.current > 0
              ? totalSpeedSecondsRef.current / totalTimeSecondsRef.current
              : 0,
        };
      });
    };

    const applyNativeUpdate = (event: SpeedUpdateEvent) => {
      setStats({
        speedMps: event.speedMps,
        averageSpeedMps: event.averageSpeedMps,
        maxSpeedMps: event.maxSpeedMps,
        distanceMeters: event.distanceMeters,
      });
      setHeadingDegrees(event.headingDegrees);
      setHeadingSource(event.headingSource);
      setHeadingAccuracyDegrees(event.headingAccuracyDegrees);
      setHeadingQuality(event.headingQuality);
      setHeadingReasons(event.headingReasons);
      setStatus('ready');
      setQuality(event.quality);
      setSource(event.source);
      setErrorMessage(null);
      setStale(event.stale);
      setTimestampMs(event.timestampMs);
      setQualityScore(event.qualityScore);
      setQualityReasons(event.qualityReasons);
      setGpsAccuracyMeters(event.gpsAccuracyMeters);
      setFixAgeMs(event.fixAgeMs);
      setNativeSpeedUsed(event.nativeSpeedUsed);
      setGpsAvailable(event.gpsAvailable);
      setMotionAvailable(event.motionAvailable);
      setHeadingAvailable(event.headingAvailable);
      setIsMoving(event.isMoving);
      setIsStopped(event.isStopped);
      speedMpsRef.current = event.speedMps;
    };

    const applyNativeError = (event: SpeedErrorEvent) => {
      const nextStatus: SensorStatus =
        event.code === 'permission_denied'
          ? 'permission_denied'
          : event.code === 'precise_location_required'
            ? 'precise_location_required'
          : event.code === 'sensor_unavailable'
            ? 'sensor_unavailable'
            : 'error';
      setStatus(nextStatus);
      setErrorMessage(getNativeSpeedErrorMessage(event.code));
      if (event.code === 'permission_denied') {
        setPermission('denied');
      } else if (event.code === 'precise_location_required') {
        setPermission('precise_required');
        setHeadingSource('none');
        setHeadingQuality('poor');
        setHeadingReasons(['precise-location-required', 'no-heading']);
      }
      logSensorWarning(`Native speed engine ${event.code}: ${event.message}`);
    };

    const startNativeEngine = async (): Promise<boolean> => {
      if (!shouldUseNativeEngine) {
        return false;
      }

      try {
        setPermission('requesting');
        const { status: locationStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return true;
        }
        if (locationStatus !== 'granted') {
          setPermission('denied');
          setStatus('permission_denied');
          setErrorMessage('Permission to access location was denied');
          logSensorWarning('Location permission denied');
          return true;
        }

        nativeUpdateSubscription = NativeSpeedEngine.addSpeedUpdateListener(
          (event) => {
            if (isMounted) {
              applyNativeUpdate(event);
            }
          }
        );
        nativeErrorSubscription = NativeSpeedEngine.addSpeedErrorListener(
          (event) => {
            if (isMounted) {
              applyNativeError(event);
            }
          }
        );

        await NativeSpeedEngine.start({
          mountOffsetDegrees: mountOffsetRef.current,
          accumulateTrip: accumulateTripRef.current,
          staleTimeoutMs: LOCATION_STALE_TIMEOUT_MS,
          outputRateHz: 10,
        });
        if (!isMounted) {
          return true;
        }

        nativeEngineActiveRef.current = true;
        setPermission('granted');
        setStatus('initializing');
        return true;
      } catch (error) {
        nativeEngineActiveRef.current = false;
        nativeUpdateSubscription?.remove();
        nativeErrorSubscription?.remove();
        nativeUpdateSubscription = null;
        nativeErrorSubscription = null;
        logSensorWarning(
          `Native speed engine unavailable, falling back to JS sensors: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return false;
      }
    };

    const start = async () => {
      try {
        if (__DEV__ && simulationEnabled) {
          simulatedDriveStartedAtRef.current = Date.now();
          lastSpeedSampleTimestampRef.current = null;
          setPermission('granted');
          setStatus('ready');
          setErrorMessage(null);
          applySimulatedDriveUpdate();
          const simulatedDriveInterval = setInterval(
            applySimulatedDriveUpdate,
            SIMULATED_DRIVE_TICK_MS
          );
          return () => clearInterval(simulatedDriveInterval);
        }

        if (await startNativeEngine()) {
          return;
        }

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
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: LOCATION_UPDATE_INTERVAL_MS,
            distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
          },
          (location) => {
            const { coords, timestamp } = location;
            const lastLocation = lastLocationRef.current;
            const lastTimestamp = lastTimestampRef.current;

            lastAccuracyRef.current = coords.accuracy;
            lastFixTimestampRef.current = timestamp;
            setTimestampMs(timestamp);
            setStale(false);
            setGpsAccuracyMeters(coords.accuracy ?? null);
            setFixAgeMs(0);

            if (lastLocation && lastTimestamp) {
              const distanceDelta = calculateDistance(lastLocation, coords);
              const timeDiff = (timestamp - lastTimestamp) / 1000;

              if (shouldUseGpsSample(coords, timeDiff)) {
                const derivedSpeed =
                  timeDiff > 0 ? distanceDelta / timeDiff : 0;
                const nativeSpeedMps = coords.speed;
                const hasNativeSpeed = isNativeSpeedUsable(nativeSpeedMps);
                setNativeSpeedUsed(hasNativeSpeed);
                const rawSpeedMps = hasNativeSpeed ? nativeSpeedMps : derivedSpeed;
                const gpsSpeedMps = sanitizeSpeed(rawSpeedMps, derivedSpeed);

                const filteredSpeedMps = filterSpeed(
                  gpsSpeedMps,
                  coords.accuracy,
                  timeDiff
                );
                const speedDelta = Math.abs(gpsSpeedMps - speedMpsRef.current);
                const blendFactor = hasNativeSpeed
                  ? GPS_NATIVE_SPEED_BLEND
                  : GPS_DERIVED_SPEED_BLEND;
                const responsiveSpeedMps =
                  speedDelta >= RESPONSIVE_SPEED_DELTA_MPS
                    ? filteredSpeedMps +
                      (gpsSpeedMps - filteredSpeedMps) * blendFactor
                    : filteredSpeedMps;
                const nextSpeedMps =
                  gpsSpeedMps < MIN_MOVING_SPEED_MPS &&
                  responsiveSpeedMps < MIN_MOVING_SPEED_MPS
                    ? 0
                    : responsiveSpeedMps;
                const courseHeading =
                  typeof coords.heading === 'number' && coords.heading >= 0
                    ? normalizeHeadingDegrees(coords.heading)
                    : null;

                const accumulate = accumulateTripRef.current;
                updateSpeedStats(nextSpeedMps, timestamp, {
                  accumulate,
                });

                const accuracyOk =
                  coords.accuracy == null ||
                  coords.accuracy <= MAX_GPS_ACCURACY_METERS;
                if (
                  accumulate &&
                  accuracyOk &&
                  gpsSpeedMps >= MIN_MOVING_SPEED_MPS
                ) {
                  setStats((prev) => ({
                    ...prev,
                    distanceMeters: prev.distanceMeters + distanceDelta,
                  }));
                }

                setSource('gps');
                setQualityReasons(hasNativeSpeed ? ['native-speed-used'] : []);
                if (courseHeading != null && nextSpeedMps >= MIN_MOVING_SPEED_MPS) {
                  headingRef.current = courseHeading;
                  setHeadingDegrees(courseHeading);
                  setHeadingSource('course');
                  setHeadingAccuracyDegrees(null);
                  setHeadingQuality('medium');
                  setHeadingReasons(['course-used']);
                  setHeadingAvailable(true);
                } else if (courseHeading != null) {
                  setHeadingReasons((prev) =>
                    prev.includes('low-speed-course-ignored')
                      ? prev
                      : ['low-speed-course-ignored', ...prev]
                  );
                }
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
              updateSpeedStats(predictedSpeed, now, {
                accumulate: accumulateTripRef.current,
              });
              setSource((prev) =>
                prev === 'gps' ? 'blended' : 'motion-only'
              );
            });
            setMotionAvailable(true);
          }
        }
        } catch (error) {
          // Motion is optional; do not fail the whole sensor pipeline.
          logSensorWarning(
            `DeviceMotion error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        try {
          headingSubscription = await Location.watchHeadingAsync(
            (headingData) => {
              const nextHeading =
                headingData.trueHeading >= 0
                  ? headingData.trueHeading
                  : headingData.magHeading;
              const latestCourse = lastLocationRef.current?.heading;
              if (
                speedMpsRef.current >= MIN_MOVING_SPEED_MPS &&
                typeof latestCourse === 'number' &&
                latestCourse >= 0
              ) {
                return;
              }
              const accuracyDegrees =
                typeof headingData.accuracy === 'number'
                  ? headingData.accuracy
                  : null;
              const nextHeadingQuality = getHeadingQuality(accuracyDegrees);
              headingRef.current = nextHeading;
              const adjusted = normalizeHeadingDegrees(
                nextHeading + mountOffsetRef.current
              );
              setHeadingDegrees(adjusted);
              setHeadingSource('device');
              setHeadingAccuracyDegrees(accuracyDegrees);
              setHeadingQuality(nextHeadingQuality);
              setHeadingReasons([
                ...(speedMpsRef.current < MIN_MOVING_SPEED_MPS
                  ? ['low-speed-course-ignored']
                  : []),
                'device-heading-used',
                ...(nextHeadingQuality === 'poor'
                  ? ['poor-heading-accuracy']
                  : []),
              ]);
              setHeadingAvailable(true);
            }
          );
        } catch {
          headingRef.current = null;
          setHeadingDegrees(null);
          setHeadingSource('none');
          setHeadingAccuracyDegrees(null);
          setHeadingQuality('poor');
          setHeadingReasons(['no-heading']);
          setHeadingAvailable(false);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setStatus('error');
        logSensorWarning(
          `JS sensor pipeline error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        setErrorMessage(getUserFacingErrorMessage(error, 'sensor'));
      }
    };

    let stopSimulation: (() => void) | undefined;
    void start().then((cleanup) => {
      stopSimulation = cleanup;
    });

    return () => {
      isMounted = false;
      stopSimulation?.();
      nativeUpdateSubscription?.remove();
      nativeErrorSubscription?.remove();
      if (nativeEngineActiveRef.current) {
        nativeEngineActiveRef.current = false;
        void NativeSpeedEngine.stop().catch((error) => {
          logSensorWarning(
            `Native speed engine stop error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });
      }
      locationSubscription?.remove();
      headingSubscription?.remove();
      motionSubscription?.remove();
    };
  }, [
    filterSpeed,
    kalmanOptions,
    predictSpeed,
    shouldUseNativeEngine,
    simulationEnabled,
  ]);

  useEffect(() => {
    speedMpsRef.current = stats.speedMps;
  }, [stats.speedMps]);

  useEffect(() => {
    const interval = setInterval(() => {
      const speedMps = speedMpsRef.current;
      const now = Date.now();

      if (speedMps >= MIN_MOVING_SPEED_MPS) {
        const firstAt = firstAboveThresholdAtRef.current;
        if (firstAt === null) {
          firstAboveThresholdAtRef.current = now;
        } else {
          const sustainedSeconds = (now - firstAt) / 1000;
          if (sustainedSeconds >= AUTO_START_MOTION_SUSTAIN_SECONDS) {
            setIsMoving(true);
          }
        }
        firstBelowThresholdAtRef.current = null;
        setIsStopped(false);
      } else {
        firstAboveThresholdAtRef.current = null;
        setIsMoving(false);
        const firstBelow = firstBelowThresholdAtRef.current;
        if (firstBelow === null) {
          firstBelowThresholdAtRef.current = now;
        } else {
          const sustainedSeconds = (now - firstBelow) / 1000;
          if (sustainedSeconds >= AUTO_STOP_MOTION_SUSTAIN_SECONDS) {
            setIsStopped(true);
          }
        }
      }
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const lastFix = lastFixTimestampRef.current;
      const lastAccuracy = lastAccuracyRef.current;
      if (!lastFix) {
        return;
      }
      const now = Date.now();
      const seconds = (now - lastFix) / 1000;
      const nextQuality = getSignalQuality(lastAccuracy, seconds);
      setQuality(nextQuality);
      setQualityScore(
        nextQuality === 'good' ? 0.95 : nextQuality === 'medium' ? 0.65 : 0.25
      );
      setFixAgeMs(now - lastFix);
      if (now - lastFix >= LOCATION_STALE_TIMEOUT_MS) {
        setQuality('poor');
        setStale(true);
        setQualityScore(0);
        setQualityReasons(['stale']);
        if (speedMpsRef.current > 0) {
          updateSpeedStats(0, now, { accumulate: false });
          setSource('none');
        }
      }
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const state: VelocitySensorsState = useMemo(
    () => ({
      ...stats,
      headingDegrees,
      headingSource,
      headingAccuracyDegrees,
      headingQuality,
      headingReasons,
      permission,
      status,
      quality,
      source,
      errorMessage,
      units,
      stale,
      timestampMs,
      qualityScore,
      qualityReasons,
      gpsAccuracyMeters,
      fixAgeMs,
      nativeSpeedUsed,
      motionAvailable,
      gpsAvailable,
      headingAvailable,
      isMoving,
      isStopped,
    }),
    [
      stats,
      headingDegrees,
      headingSource,
      headingAccuracyDegrees,
      headingQuality,
      headingReasons,
      permission,
      status,
      quality,
      source,
      errorMessage,
      units,
      stale,
      timestampMs,
      qualityScore,
      qualityReasons,
      gpsAccuracyMeters,
      fixAgeMs,
      nativeSpeedUsed,
      motionAvailable,
      gpsAvailable,
      headingAvailable,
      isMoving,
      isStopped,
    ]
  );

  return {
    state,
    reset,
  };
};
