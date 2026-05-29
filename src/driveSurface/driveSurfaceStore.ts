import * as NativeSpeedEngine from 'v3l0city-speed-engine';

import type { DriveSurfaceSnapshot } from './snapshot';

type DriveSurfaceNative = typeof NativeSpeedEngine & {
  writeDriveSurfaceSnapshot?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  clearDriveSurfaceSnapshot?: () => Promise<void>;
  startLiveDriveSession?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  updateLiveDriveSession?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  stopLiveDriveSession?: (snapshot: DriveSurfaceSnapshot) => Promise<void>;
  getLiveDriveSessionStatus?: () => Promise<{
    active: boolean;
    collectorsActive: boolean;
    dashboardActive?: boolean;
    listenerCount?: number;
  }>;
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

export const startLiveDriveSession = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.startLiveDriveSession?.(snapshot);
};

export const updateLiveDriveSession = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.updateLiveDriveSession?.(snapshot);
};

export const stopLiveDriveSession = async (
  snapshot: DriveSurfaceSnapshot,
): Promise<void> => {
  await nativeDriveSurface.stopLiveDriveSession?.(snapshot);
};

export const getLiveDriveSessionStatus = async (): Promise<{
  active: boolean;
  collectorsActive: boolean;
  dashboardActive?: boolean;
  listenerCount?: number;
}> =>
  nativeDriveSurface.getLiveDriveSessionStatus?.() ?? {
    active: false,
    collectorsActive: false,
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
