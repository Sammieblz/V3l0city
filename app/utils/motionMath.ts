import { DeviceMotionOrientation } from 'expo-sensors';
import { TWO_PI } from './constants';

type Acceleration = {
  x: number;
  y: number;
  z: number;
};

type Rotation = {
  alpha: number;
  beta: number;
  gamma: number;
};

// expo-sensors may report rotation either in radians (small values) or degrees
// (values with magnitude greater than 2π). This helper normalizes everything
// to radians so downstream math is consistent.
const toRadians = (value: number): number => {
  const absValue = Math.abs(value);
  if (absValue > TWO_PI) {
    return (value * Math.PI) / 180;
  }
  return value;
};

// Normalizes any heading value into the [0, 360) range.
export const normalizeHeadingDegrees = (value: number): number => {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeRotation = (rotation: Rotation): Rotation => ({
  alpha: toRadians(rotation.alpha),
  beta: toRadians(rotation.beta),
  gamma: toRadians(rotation.gamma),
});

// Rotates device-frame acceleration into an approximate world frame using
// the provided rotation angles. This assumes a right-handed coordinate
// system matching expo-sensors conventions.
const rotateToWorld = (acceleration: Acceleration, rotation: Rotation) => {
  const { alpha, beta, gamma } = normalizeRotation(rotation);
  const cX = Math.cos(beta);
  const cY = Math.cos(gamma);
  const cZ = Math.cos(alpha);
  const sX = Math.sin(beta);
  const sY = Math.sin(gamma);
  const sZ = Math.sin(alpha);

  const m11 = cZ * cY - sZ * sX * sY;
  const m12 = -cX * sZ;
  const m13 = cY * sZ * sX + cZ * sY;
  const m21 = cY * sZ + cZ * sX * sY;
  const m22 = cZ * cX;
  const m23 = sZ * sY - cZ * cY * sX;
  const m31 = -cX * sY;
  const m32 = sX;
  const m33 = cX * cY;

  return {
    x: m11 * acceleration.x + m12 * acceleration.y + m13 * acceleration.z,
    y: m21 * acceleration.x + m22 * acceleration.y + m23 * acceleration.z,
    z: m31 * acceleration.x + m32 * acceleration.y + m33 * acceleration.z,
  };
};

// Fallback forward-acceleration heuristic based purely on device orientation
// when we do not have a reliable rotation matrix and/or heading.
const getOrientationForwardAcceleration = (
  acceleration: Acceleration,
  orientation: DeviceMotionOrientation | null | undefined
): number => {
  switch (orientation) {
    case DeviceMotionOrientation.RightLandscape:
      return acceleration.x;
    case DeviceMotionOrientation.LeftLandscape:
      return -acceleration.x;
    case DeviceMotionOrientation.UpsideDown:
      return -acceleration.y;
    case DeviceMotionOrientation.Portrait:
    default:
      return acceleration.y;
  }
};

export const getForwardAcceleration = (
  acceleration: Acceleration | null,
  orientation: DeviceMotionOrientation | null | undefined,
  rotation: Rotation | null | undefined,
  headingDegrees: number | null | undefined
): number => {
  if (!acceleration) {
    return 0;
  }

  if (rotation && headingDegrees != null && !Number.isNaN(headingDegrees)) {
    const worldAcceleration = rotateToWorld(acceleration, rotation);
    const headingRad = (headingDegrees * Math.PI) / 180;
    const forwardX = Math.sin(headingRad);
    const forwardY = Math.cos(headingRad);
    return worldAcceleration.x * forwardX + worldAcceleration.y * forwardY;
  }

  return getOrientationForwardAcceleration(acceleration, orientation);
};
