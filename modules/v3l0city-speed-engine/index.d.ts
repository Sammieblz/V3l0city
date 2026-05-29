import type { EventSubscription } from 'expo-modules-core';

export type SpeedSource = 'none' | 'gps' | 'blended' | 'motion-only';
export type SignalQuality = 'good' | 'medium' | 'poor';
export type HeadingSource = 'none' | 'course' | 'device';

export type SpeedEngineStartOptions = {
  mountOffsetDegrees?: number;
  accumulateTrip?: boolean;
  staleTimeoutMs?: number;
  outputRateHz?: number;
};

export type SpeedUpdateEvent = {
  speedMps: number;
  averageSpeedMps: number;
  maxSpeedMps: number;
  distanceMeters: number;
  headingDegrees: number | null;
  headingSource: HeadingSource;
  headingAccuracyDegrees: number | null;
  headingQuality: SignalQuality;
  headingReasons: string[];
  source: SpeedSource;
  quality: SignalQuality;
  isMoving: boolean;
  isStopped: boolean;
  stale: boolean;
  gpsAvailable: boolean;
  motionAvailable: boolean;
  headingAvailable: boolean;
  timestampMs: number;
  qualityScore: number;
  qualityReasons: string[];
  gpsAccuracyMeters: number | null;
  fixAgeMs: number | null;
  nativeSpeedUsed: boolean;
};

export type SpeedErrorEvent = {
  code: string;
  message: string;
  recoverable: boolean;
};

export type DriveSurfaceSnapshot = {
  schemaVersion: 1;
  tripId: string | null;
  tripActive: boolean;
  tripPaused: boolean;
  speedMps: number;
  speedText: string;
  units: 'km/h' | 'MPH';
  distanceMeters: number;
  distanceText: string;
  averageSpeedMps: number;
  averageSpeedText: string;
  maxSpeedMps: number;
  maxSpeedText: string;
  elapsedMs: number;
  elapsedText: string;
  headingDegrees: number | null;
  headingText: string;
  headingSource: HeadingSource;
  headingQuality: SignalQuality;
  signalQuality: SignalQuality;
  signalText: string;
  stale: boolean;
  permissionStatus: string;
  updatedAtMs: number;
  simulationActive: boolean;
};

export function isAvailable(): boolean;
export function start(options?: SpeedEngineStartOptions): Promise<void>;
export function stop(): Promise<void>;
export function reset(): Promise<void>;
export function setTripAccumulation(active: boolean): Promise<void>;
export function setMountOffsetDegrees(value: number): Promise<void>;
export function writeDriveSurfaceSnapshot(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function clearDriveSurfaceSnapshot(): Promise<void>;
export function startLiveDriveSession(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function updateLiveDriveSession(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function stopLiveDriveSession(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function getLiveDriveSessionStatus(): Promise<{
  active: boolean;
  collectorsActive: boolean;
  dashboardActive?: boolean;
  listenerCount?: number;
}>;
export function startTripLiveActivity(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function updateTripLiveActivity(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function endTripLiveActivity(snapshot: DriveSurfaceSnapshot): Promise<void>;
export function addSpeedUpdateListener(
  listener: (event: SpeedUpdateEvent) => void
): EventSubscription;
export function addSpeedErrorListener(
  listener: (event: SpeedErrorEvent) => void
): EventSubscription;
