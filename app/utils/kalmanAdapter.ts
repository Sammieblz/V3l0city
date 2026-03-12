import KalmanFilter from 'kalmanjs';

export type KalmanOptions = {
  R: number;
  Q: number;
};

type KalmanInternal = {
  R: number;
};

export const createKalmanFilter = (options: KalmanOptions): KalmanFilter => {
  return new KalmanFilter(options);
};

export const filterValue = (filter: KalmanFilter, value: number): number => {
  // kalmanjs exposes the current state on .x; clamp to non‑negative
  return Math.max(0, filter.filter(value).x);
};

export const predictValue = (
  filter: KalmanFilter,
  delta: number
): number => {
  return Math.max(0, filter.predict(delta).x);
};

export const resetKalmanFilter = (
  current: KalmanFilter,
  options: KalmanOptions
): KalmanFilter => {
  // Replace the underlying instance with a fresh one configured
  // with the original options.
  void current; // explicit that current is intentionally unused
  return new KalmanFilter(options);
};

export const setMeasurementNoise = (
  filter: KalmanFilter,
  variance: number,
  minR: number,
  maxR: number
): void => {
  const clamped = Math.min(maxR, Math.max(minR, variance));
  (filter as unknown as KalmanInternal).R = clamped;
};

