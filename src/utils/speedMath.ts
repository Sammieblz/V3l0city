import type * as Location from 'expo-location';
import {
  EARTH_RADIUS_METERS,
  MAX_KALMAN_R,
  METERS_PER_KILOMETER,
  METERS_PER_MILE,
  MIN_KALMAN_R,
  SECONDS_PER_HOUR,
} from './constants';
import type KalmanFilter from 'kalmanjs';
import { setMeasurementNoise } from './kalmanAdapter';

export type Units = 'km/h' | 'MPH';

export const toDisplaySpeed = (speedMps: number, units: Units): number => {
  if (units === 'km/h') {
    return (speedMps * SECONDS_PER_HOUR) / METERS_PER_KILOMETER;
  }
  return (speedMps * SECONDS_PER_HOUR) / METERS_PER_MILE;
};

export const toDisplayDistance = (
  distanceMeters: number,
  units: Units
): number => {
  if (units === 'km/h') {
    return distanceMeters / METERS_PER_KILOMETER;
  }
  return distanceMeters / METERS_PER_MILE;
};

export const calculateDistance = (
  coords1: Location.LocationObjectCoords,
  coords2: Location.LocationObjectCoords
): number => {
  const lat1 = (coords1.latitude * Math.PI) / 180;
  const lat2 = (coords2.latitude * Math.PI) / 180;
  const dLat = ((coords2.latitude - coords1.latitude) * Math.PI) / 180;
  const dLon = ((coords2.longitude - coords1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

export const updateKalmanNoise = (
  filter: KalmanFilter,
  accuracyMeters: number | null | undefined,
  timeDiffSeconds: number
): void => {
  if (!accuracyMeters || accuracyMeters <= 0) {
    return;
  }

  const speedAccuracyMps = accuracyMeters / Math.max(timeDiffSeconds, 1);
  const variance = speedAccuracyMps * speedAccuracyMps;
  setMeasurementNoise(filter, variance, MIN_KALMAN_R, MAX_KALMAN_R);
};
