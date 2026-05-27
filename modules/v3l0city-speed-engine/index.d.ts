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

export function isAvailable(): boolean;
export function start(options?: SpeedEngineStartOptions): Promise<void>;
export function stop(): Promise<void>;
export function reset(): Promise<void>;
export function setTripAccumulation(active: boolean): Promise<void>;
export function setMountOffsetDegrees(value: number): Promise<void>;
export function addSpeedUpdateListener(
  listener: (event: SpeedUpdateEvent) => void
): EventSubscription;
export function addSpeedErrorListener(
  listener: (event: SpeedErrorEvent) => void
): EventSubscription;
