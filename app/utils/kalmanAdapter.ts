import KalmanFilter from 'kalmanjs';

export type KalmanOptions = {
  R: number;
  Q: number;
};

type KalmanInternal = {
  R: number;
};

type KalmanResult = number | { x: number };

const toNonNegativeNumber = (result: KalmanResult): number => {
  const value = typeof result === 'number' ? result : result.x;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export const createKalmanFilter = (options: KalmanOptions): KalmanFilter => {
  return new KalmanFilter({ B: 1, ...options });
};

export const filterValue = (filter: KalmanFilter, value: number): number => {
  return toNonNegativeNumber(filter.filter(value) as unknown as KalmanResult);
};

export const predictValue = (
  filter: KalmanFilter,
  delta: number
): number => {
  return toNonNegativeNumber(filter.predict(delta) as unknown as KalmanResult);
};

export const resetKalmanFilter = (
  current: KalmanFilter,
  options: KalmanOptions
): KalmanFilter => {
  // Replace the underlying instance with a fresh one configured
  // with the original options.
  void current; // explicit that current is intentionally unused
  return createKalmanFilter(options);
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
