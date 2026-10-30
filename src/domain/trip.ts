import type { Units } from '../utils/speedMath';

export type TripSpeedSource = 'none' | 'gps' | 'blended' | 'motion-only';
export type TripSignalQuality = 'good' | 'medium' | 'poor';
export type TripHeadingSource = 'none' | 'course' | 'device';
export type TripRecordStatus = 'draft' | 'completed';
export type TripSyncStatus = 'local' | 'pending' | 'synced' | 'error';
export type RecordingState = 'recording' | 'paused' | 'completed';
export type RecordingGapReason = 'restart' | 'background' | 'paused' | 'permission' | 'sensor' | 'storage' | 'sampling';
export type RecordingGap = {
  id: string;
  tripId: string;
  reason: RecordingGapReason;
  startedAt: string;
  endedAt: string | null;
};

export type Trip = {
  id: string;
  startedAt: string;
  endedAt: string;
  totalDistanceMeters: number;
  maxSpeedMps: number;
  averageSpeedMps: number;
  units: Units;
  mountLabel?: string;
  recordStatus?: TripRecordStatus;
  localUpdatedAt?: string;
  deletedAt?: string | null;
  cloudSyncedAt?: string | null;
  cloudSyncError?: string | null;
  syncStatus?: TripSyncStatus;
  recordingGaps?: RecordingGap[];
};

/** Confirmed local state; neither a widget snapshot nor a connected grant. */
export type RecordingSession = {
  trip: Trip;
  state: RecordingState;
  checkpointAt: string;
  lastSampleSequence: number;
  lastSampleRecordedAt: string | null;
  lastSampleElapsedMs: number;
  gaps: RecordingGap[];
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
