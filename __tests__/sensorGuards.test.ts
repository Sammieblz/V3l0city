import {
  isNativeSpeedUsable,
  sanitizeSpeed,
  shouldUseGpsSample,
} from '../src/utils/sensorGuards';
import type * as Location from 'expo-location';

const coords: Location.LocationObjectCoords = {
  latitude: 0,
  longitude: 0,
  altitude: 0,
  accuracy: 10,
  altitudeAccuracy: 0,
  heading: 0,
  speed: 0,
};

describe('sensorGuards', () => {
  it('uses fallback speed when native speed is invalid or negative', () => {
    expect(sanitizeSpeed(Number.NaN, 4)).toBe(4);
    expect(sanitizeSpeed(-1, 4)).toBe(4);
  });

  it('clamps unreasonable speeds', () => {
    expect(sanitizeSpeed(100, 4)).toBe(80);
    expect(sanitizeSpeed(-1, 100)).toBe(80);
  });

  it('detects usable native speed samples', () => {
    expect(isNativeSpeedUsable(0)).toBe(true);
    expect(isNativeSpeedUsable(12)).toBe(true);
    expect(isNativeSpeedUsable(-1)).toBe(false);
    expect(isNativeSpeedUsable(null)).toBe(false);
  });

  it('rejects unusable GPS samples', () => {
    expect(shouldUseGpsSample(coords, 1)).toBe(true);
    expect(shouldUseGpsSample({ ...coords, accuracy: 100 }, 1)).toBe(false);
    expect(shouldUseGpsSample(coords, 0)).toBe(false);
  });
});
