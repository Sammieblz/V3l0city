import * as NativeSpeedEngine from 'v3l0city-speed-engine';

import type { DriveSurfaceSnapshot } from './snapshot';

type DriveSurfaceNative = typeof NativeSpeedEngine & {
  writeDriveSurfaceSnapshot?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  clearDriveSurfaceSnapshot?: () => Promise<void>;
  startTripLiveActivity?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  updateTripLiveActivity?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  endTripLiveActivity?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
};

const nativeDriveSurface = NativeSpeedEngine as DriveSurfaceNative;

export const writeDriveSurfaceSnapshot = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.writeDriveSurfaceSnapshot?.(snapshot);
};

export const clearDriveSurfaceSnapshot = async (): Promise<void> => {
  await nativeDriveSurface.clearDriveSurfaceSnapshot?.();
};

export const startTripLiveActivity = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.startTripLiveActivity?.(snapshot);
};

export const updateTripLiveActivity = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.updateTripLiveActivity?.(snapshot);
};

export const endTripLiveActivity = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.endTripLiveActivity?.(snapshot);
};
