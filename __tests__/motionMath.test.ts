import { DeviceMotionOrientation } from 'expo-sensors';
import {
  getForwardAcceleration,
  normalizeHeadingDegrees,
} from '../app/utils/motionMath';

describe('motionMath', () => {
  it('normalizes heading degrees into [0, 360)', () => {
    expect(normalizeHeadingDegrees(370)).toBe(10);
    expect(normalizeHeadingDegrees(-10)).toBe(350);
    expect(normalizeHeadingDegrees(720)).toBe(0);
  });

  it('uses orientation fallback when no rotation or heading', () => {
    const acceleration = { x: 1, y: 2, z: 3 };
    expect(
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.Portrait,
        null,
        null
      )
    ).toBe(2);
    expect(
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.RightLandscape,
        null,
        null
      )
    ).toBe(1);
    expect(
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.LeftLandscape,
        null,
        null
      )
    ).toBe(-1);
    expect(
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.UpsideDown,
        null,
        null
      )
    ).toBe(-2);
  });

  it('projects world acceleration along heading for simple rotation', () => {
    const acceleration = { x: 1, y: 2, z: 0 };
    const rotation = { alpha: 0, beta: 0, gamma: 0 };
    expect(
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.Portrait,
        rotation,
        0
      )
    ).toBeCloseTo(2, 5);
    expect(
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.Portrait,
        rotation,
        90
      )
    ).toBeCloseTo(1, 5);
  });

  it('returns zero when acceleration is null', () => {
    expect(
      getForwardAcceleration(
        null,
        DeviceMotionOrientation.Portrait,
        null,
        null
      )
    ).toBe(0);
  });

  it('falls back to orientation when heading is NaN', () => {
    const acceleration = { x: 0, y: 3, z: 0 };
    const rotation = { alpha: 0, beta: 0, gamma: 0 };
    expect(
      // headingDegrees is NaN so we should ignore rotation and use orientation
      getForwardAcceleration(
        acceleration,
        DeviceMotionOrientation.Portrait,
        rotation,
        Number.NaN
      )
    ).toBe(3);
  });
});
