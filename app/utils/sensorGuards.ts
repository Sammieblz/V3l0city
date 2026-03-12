import type * as Location from 'expo-location';

import { MAX_GPS_ACCURACY_METERS } from './constants';

const MAX_REASONABLE_SPEED_MPS = 80; // ~288 km/h

export const isGpsAccuracyAcceptable = (
  accuracyMeters: number | null | undefined
): boolean => {
  if (accuracyMeters == null) {
    return true;
  }
  return accuracyMeters <= MAX_GPS_ACCURACY_METERS * 2;
};

export const sanitizeSpeed = (
  rawSpeedMps: number,
  fallbackSpeedMps: number
): number => {
  const candidate = Number.isFinite(rawSpeedMps) ? rawSpeedMps : fallbackSpeedMps;
  if (candidate < 0) {
    return 0;
  }
  if (candidate > MAX_REASONABLE_SPEED_MPS) {
    return MAX_REASONABLE_SPEED_MPS;
  }
  return candidate;
};

export const shouldUseGpsSample = (
  coords: Location.LocationObjectCoords,
  timeDiffSeconds: number
): boolean => {
  if (timeDiffSeconds <= 0) {
    return false;
  }
  if (!isGpsAccuracyAcceptable(coords.accuracy)) {
    return false;
  }
  return true;
};

export const isMotionSampleUsable = (
  timeDiffSeconds: number,
  maxGapSeconds: number
): boolean => {
  if (timeDiffSeconds <= 0) {
    return false;
  }
  if (timeDiffSeconds > maxGapSeconds) {
    return false;
  }
  return true;
};

