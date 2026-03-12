import type KalmanFilter from 'kalmanjs';
import type * as Location from 'expo-location';
import {
  calculateDistance,
  toDisplayDistance,
  toDisplaySpeed,
  updateKalmanNoise,
} from '../app/utils/speedMath';

describe('speedMath', () => {
  it('converts speed to km/h and mph', () => {
    expect(toDisplaySpeed(10, 'km/h')).toBeCloseTo(36, 5);
    expect(toDisplaySpeed(10, 'MPH')).toBeCloseTo(22.369, 3);
  });

  it('converts distance to km and miles', () => {
    expect(toDisplayDistance(1000, 'km/h')).toBeCloseTo(1, 5);
    expect(toDisplayDistance(1609.344, 'MPH')).toBeCloseTo(1, 5);
  });

  it('calculates zero distance for identical coordinates', () => {
    const coords: Location.LocationObjectCoords = {
      latitude: 0,
      longitude: 0,
      altitude: 0,
      accuracy: 0,
      altitudeAccuracy: 0,
      heading: 0,
      speed: 0,
    };
    expect(calculateDistance(coords, coords)).toBeCloseTo(0, 5);
  });

  it('clamps Kalman R based on accuracy', () => {
    const filter = { R: 0 } as { R: number };
    updateKalmanNoise(filter as unknown as KalmanFilter, 10, 1);
    expect(filter.R).toBeCloseTo(25, 5);
    updateKalmanNoise(filter as unknown as KalmanFilter, 0.1, 1);
    expect(filter.R).toBeCloseTo(0.01, 5);
  });
});
