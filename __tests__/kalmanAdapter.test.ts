import {
  createKalmanFilter,
  filterValue,
  predictValue,
  resetKalmanFilter,
  setMeasurementNoise,
} from '../app/utils/kalmanAdapter';

describe('kalmanAdapter', () => {
  it('filters and predicts non-negative values', () => {
    const filter = createKalmanFilter({ R: 0.01, Q: 3 });

    const filtered1 = filterValue(filter, 10);
    const predicted = predictValue(filter, -5);

    expect(filtered1).toBeGreaterThanOrEqual(0);
    expect(predicted).toBeGreaterThanOrEqual(0);
  });

  it('clamps measurement noise between bounds', () => {
    const filter = createKalmanFilter({ R: 0.01, Q: 3 });

    setMeasurementNoise(filter, 1000, 0.01, 25);
    // @ts-expect-error accessing internal for test
    expect(filter.R).toBe(25);

    setMeasurementNoise(filter, 0.0001, 0.01, 25);
    // @ts-expect-error accessing internal for test
    expect(filter.R).toBe(0.01);
  });

  it('resets filter with initial options', () => {
    const initial = createKalmanFilter({ R: 0.5, Q: 1 });
    const reset = resetKalmanFilter(initial, { R: 0.5, Q: 1 });

    expect(reset).not.toBe(initial);
  });
});

