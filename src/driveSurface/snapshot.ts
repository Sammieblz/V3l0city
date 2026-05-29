import type { SignalQuality, VelocitySensorsState } from '../hooks/useVelocitySensors';
import type { Units } from '../utils/speedMath';
import { toDisplayDistance, toDisplaySpeed } from '../utils/speedMath';

export const DRIVE_SURFACE_STALE_AFTER_MS = 5000;

export type DriveSurfaceSnapshot = {
  schemaVersion: 1;
  tripId: string | null;
  tripActive: boolean;
  tripPaused: boolean;
  speedMps: number;
  speedText: string;
  units: Units;
  distanceMeters: number;
  distanceText: string;
  averageSpeedMps: number;
  maxSpeedMps: number;
  elapsedMs: number;
  elapsedText: string;
  headingDegrees: number | null;
  headingText: string;
  headingSource: VelocitySensorsState['headingSource'];
  headingQuality: SignalQuality;
  signalQuality: SignalQuality;
  signalText: string;
  stale: boolean;
  permissionStatus: VelocitySensorsState['status'];
  updatedAtMs: number;
};

type BuildDriveSurfaceSnapshotOptions = {
  state: VelocitySensorsState;
  units: Units;
  tripId: string | null;
  tripActive: boolean;
  tripPaused: boolean;
  distanceMeters: number;
  averageSpeedMps: number;
  maxSpeedMps: number;
  elapsedMs: number;
  nowMs?: number;
};

const clampFinite = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
};

const formatHeading = (headingDegrees: number | null): string => {
  if (headingDegrees == null || !Number.isFinite(headingDegrees)) {
    return '--';
  }
  return `${Math.round(((headingDegrees % 360) + 360) % 360)}°`;
};

const signalTextFor = (
  status: VelocitySensorsState['status'],
  quality: SignalQuality,
  stale: boolean,
): string => {
  if (status === 'permission_denied') {
    return 'Location off';
  }
  if (status === 'precise_location_required') {
    return 'Precise needed';
  }
  if (status === 'sensor_unavailable') {
    return 'Sensors unavailable';
  }
  if (stale) {
    return 'Stale';
  }
  return quality === 'good' ? 'Good' : quality === 'medium' ? 'Fair' : 'Poor';
};

export const buildDriveSurfaceSnapshot = ({
  state,
  units,
  tripId,
  tripActive,
  tripPaused,
  distanceMeters,
  averageSpeedMps,
  maxSpeedMps,
  elapsedMs,
  nowMs = Date.now(),
}: BuildDriveSurfaceSnapshotOptions): DriveSurfaceSnapshot => {
  const speedDisplay = toDisplaySpeed(clampFinite(state.speedMps), units);
  const distanceDisplay = toDisplayDistance(clampFinite(distanceMeters), units);
  const distanceUnit = units === 'km/h' ? 'km' : 'mi';

  return {
    schemaVersion: 1,
    tripId,
    tripActive,
    tripPaused,
    speedMps: clampFinite(state.speedMps),
    speedText: `${Math.round(speedDisplay)}`,
    units,
    distanceMeters: clampFinite(distanceMeters),
    distanceText: `${distanceDisplay.toFixed(1)} ${distanceUnit}`,
    averageSpeedMps: clampFinite(averageSpeedMps),
    maxSpeedMps: clampFinite(maxSpeedMps),
    elapsedMs: clampFinite(elapsedMs),
    elapsedText: formatElapsed(elapsedMs),
    headingDegrees: state.headingDegrees,
    headingText: formatHeading(state.headingDegrees),
    headingSource: state.headingSource,
    headingQuality: state.headingQuality,
    signalQuality: state.quality,
    signalText: signalTextFor(state.status, state.quality, state.stale),
    stale: state.stale,
    permissionStatus: state.status,
    updatedAtMs: nowMs,
  };
};

export const serializeDriveSurfaceSnapshot = (
  snapshot: DriveSurfaceSnapshot,
): string => JSON.stringify(snapshot);

export const parseDriveSurfaceSnapshot = (
  value: string | null | undefined,
): DriveSurfaceSnapshot | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<DriveSurfaceSnapshot>;
    if (parsed.schemaVersion !== 1 || typeof parsed.updatedAtMs !== 'number') {
      return null;
    }
    return parsed as DriveSurfaceSnapshot;
  } catch {
    return null;
  }
};

export const isDriveSurfaceSnapshotStale = (
  snapshot: Pick<DriveSurfaceSnapshot, 'updatedAtMs' | 'stale'> | null,
  nowMs = Date.now(),
): boolean => {
  if (!snapshot) {
    return true;
  }
  return snapshot.stale || nowMs - snapshot.updatedAtMs > DRIVE_SURFACE_STALE_AFTER_MS;
};

export const getDriveSurfaceWidgetStatusText = (
  snapshot: DriveSurfaceSnapshot | null,
  nowMs = Date.now(),
): string => {
  if (!snapshot || isDriveSurfaceSnapshotStale(snapshot, nowMs)) {
    return 'Open V3l0city to start tracking';
  }
  if (snapshot.tripPaused) {
    return 'Trip paused';
  }
  if (snapshot.tripActive) {
    return 'Trip active';
  }
  return 'Ready';
};
