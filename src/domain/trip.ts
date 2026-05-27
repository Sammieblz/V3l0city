import type { Units } from '../utils/speedMath';

export type TripSpeedSource = 'none' | 'gps' | 'blended' | 'motion-only';
export type TripSignalQuality = 'good' | 'medium' | 'poor';
export type TripHeadingSource = 'none' | 'course' | 'device';

export type Trip = {
  id: string;
  startedAt: string;
  endedAt: string;
  totalDistanceMeters: number;
  maxSpeedMps: number;
  averageSpeedMps: number;
  units: Units;
  mountLabel?: string;
};

export type TripSpeedSample = {
  tripId: string;
  sequence: number;
  recordedAt: string;
  elapsedMs: number;
  speedMps: number;
  distanceMeters: number;
  headingDegrees: number | null;
  headingSource: TripHeadingSource;
  headingAccuracyDegrees: number | null;
  headingQuality: TripSignalQuality;
  headingReasons: string[];
  source: TripSpeedSource;
  quality: TripSignalQuality;
  qualityScore: number;
  qualityReasons: string[];
  gpsAccuracyMeters: number | null;
  fixAgeMs: number | null;
  nativeSpeedUsed: boolean;
  isMoving: boolean;
  isStopped: boolean;
  stale: boolean;
  uploadedAt?: string | null;
  uploadError?: string | null;
};

export type TripWithSpeedSamples = Trip & {
  speedSamples: TripSpeedSample[];
};
