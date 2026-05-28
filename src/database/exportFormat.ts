import type {
  Trip,
  TripHeadingSource,
  TripSignalQuality,
  TripSpeedSample,
  TripSpeedSource,
  TripWithSpeedSamples,
} from '../domain/trip';
import type { Preferences } from './preferencesRepository';

const escCsv = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export type V3l0cityExportPayload = {
  preferences: Preferences | null;
  trips: TripWithSpeedSamples[];
};

export type ImportPreview = {
  tripsFound: number;
  samplesFound: number;
  preferencesFound: boolean;
};

export const buildExportPayload = (
  preferences: Preferences | null,
  trips: TripWithSpeedSamples[]
): V3l0cityExportPayload => ({ preferences, trips });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const numberValue = (value: unknown, fallback = 0): number =>
  isFiniteNumber(value) ? value : fallback;

const booleanValue = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const arrayOfStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const unitsValue = (value: unknown): Preferences['units'] =>
  value === 'MPH' || value === 'km/h' ? value : 'km/h';

const coercePreferences = (value: unknown): Preferences | null => {
  if (!isRecord(value)) {
    return null;
  }

  const orientationMode =
    value.orientationMode === 'landscape' || value.orientationMode === 'auto'
      ? value.orientationMode
      : 'portrait';

  return {
    units: unitsValue(value.units),
    mountIndex: Math.max(0, Math.round(numberValue(value.mountIndex))),
    autoStart: booleanValue(value.autoStart),
    autoSave: booleanValue(value.autoSave),
    orientationMode,
  };
};

const coerceTrip = (value: unknown): Trip | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  const startedAt = stringValue(value.startedAt);
  const endedAt = stringValue(value.endedAt);
  if (!id || !startedAt || !endedAt) {
    return null;
  }

  return {
    id,
    startedAt,
    endedAt,
    totalDistanceMeters: numberValue(value.totalDistanceMeters),
    maxSpeedMps: numberValue(value.maxSpeedMps),
    averageSpeedMps: numberValue(value.averageSpeedMps),
    units: unitsValue(value.units),
    mountLabel: stringValue(value.mountLabel) ?? undefined,
    recordStatus: value.recordStatus === 'draft' ? 'draft' : 'completed',
    localUpdatedAt: stringValue(value.localUpdatedAt) ?? undefined,
    deletedAt: stringValue(value.deletedAt),
    cloudSyncedAt: stringValue(value.cloudSyncedAt),
    cloudSyncError: stringValue(value.cloudSyncError),
    syncStatus:
      value.syncStatus === 'synced' ||
      value.syncStatus === 'pending' ||
      value.syncStatus === 'error'
        ? value.syncStatus
        : 'local',
  };
};

const speedSourceValue = (value: unknown): TripSpeedSource =>
  value === 'gps' || value === 'blended' || value === 'motion-only'
    ? value
    : 'none';

const signalQualityValue = (value: unknown): TripSignalQuality =>
  value === 'good' || value === 'medium' ? value : 'poor';

const headingSourceValue = (value: unknown): TripHeadingSource =>
  value === 'course' || value === 'device' ? value : 'none';

const coerceSample = (
  value: unknown,
  fallbackTripId: string
): TripSpeedSample | null => {
  if (!isRecord(value)) {
    return null;
  }
  const recordedAt = stringValue(value.recordedAt);
  if (!recordedAt) {
    return null;
  }

  return {
    tripId: fallbackTripId,
    sequence: Math.max(0, Math.round(numberValue(value.sequence))),
    recordedAt,
    elapsedMs: Math.max(0, Math.round(numberValue(value.elapsedMs))),
    speedMps: numberValue(value.speedMps),
    distanceMeters: numberValue(value.distanceMeters),
    headingDegrees: isFiniteNumber(value.headingDegrees)
      ? value.headingDegrees
      : null,
    headingSource: headingSourceValue(value.headingSource),
    headingAccuracyDegrees: isFiniteNumber(value.headingAccuracyDegrees)
      ? value.headingAccuracyDegrees
      : null,
    headingQuality: signalQualityValue(value.headingQuality),
    headingReasons: arrayOfStrings(value.headingReasons),
    source: speedSourceValue(value.source),
    quality: signalQualityValue(value.quality),
    qualityScore: numberValue(value.qualityScore, 0.5),
    qualityReasons: arrayOfStrings(value.qualityReasons),
    gpsAccuracyMeters: isFiniteNumber(value.gpsAccuracyMeters)
      ? value.gpsAccuracyMeters
      : null,
    fixAgeMs: isFiniteNumber(value.fixAgeMs) ? value.fixAgeMs : null,
    nativeSpeedUsed: booleanValue(value.nativeSpeedUsed),
    isMoving: booleanValue(value.isMoving),
    isStopped: booleanValue(value.isStopped),
    stale: booleanValue(value.stale),
    uploadedAt: stringValue(value.uploadedAt),
    uploadError: stringValue(value.uploadError),
  };
};

export const parseExportPayload = (
  value: unknown
): V3l0cityExportPayload => {
  if (!isRecord(value) || !Array.isArray(value.trips)) {
    throw new Error('Choose a V3l0city JSON export file.');
  }

  const trips = value.trips
    .map((tripValue) => {
      const trip = coerceTrip(tripValue);
      if (!trip || !isRecord(tripValue)) {
        return null;
      }
      const speedSamples = Array.isArray(tripValue.speedSamples)
        ? tripValue.speedSamples
            .map((sampleValue) => coerceSample(sampleValue, trip.id))
            .filter((sample): sample is TripSpeedSample => sample != null)
        : [];
      return { ...trip, speedSamples };
    })
    .filter((trip): trip is TripWithSpeedSamples => trip != null);

  if (trips.length === 0) {
    throw new Error('No valid V3l0city trips were found in this file.');
  }

  return {
    preferences: coercePreferences(value.preferences),
    trips,
  };
};

export const previewImportPayload = (
  payload: V3l0cityExportPayload
): ImportPreview => ({
  tripsFound: payload.trips.length,
  samplesFound: payload.trips.reduce(
    (total, trip) => total + trip.speedSamples.length,
    0
  ),
  preferencesFound: payload.preferences != null,
});

export const buildTripsCsv = (
  trips: Trip[],
  tripSamples: { tripId: string; samples: TripSpeedSample[] }[]
): string => {
  const headers = [
    'ID',
    'Started At',
    'Ended At',
    'Duration (min)',
    'Distance (m)',
    'Avg Speed (m/s)',
    'Max Speed (m/s)',
    'Units',
    'Mount',
    'Record Status',
    'Sync Status',
    'Local Updated At',
    'Cloud Synced At',
    'Deleted At',
    'Cloud Sync Error',
    'Speed Samples',
  ];

  const rows = trips.map((t) => {
    const durationMin = (
      (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) /
      60000
    ).toFixed(1);
    return [
      escCsv(t.id),
      escCsv(t.startedAt),
      escCsv(t.endedAt),
      durationMin,
      t.totalDistanceMeters.toFixed(1),
      t.averageSpeedMps.toFixed(2),
      t.maxSpeedMps.toFixed(2),
      t.units,
      escCsv(t.mountLabel ?? ''),
      t.recordStatus ?? 'completed',
      t.syncStatus ?? 'local',
      escCsv(t.localUpdatedAt ?? ''),
      escCsv(t.cloudSyncedAt ?? ''),
      escCsv(t.deletedAt ?? ''),
      escCsv(t.cloudSyncError ?? ''),
      String(
        tripSamples.find((sampleGroup) => sampleGroup.tripId === t.id)?.samples
          .length ?? 0
      ),
    ].join(',');
  });

  const sampleHeaders = [
    'Trip ID',
    'Sequence',
    'Recorded At',
    'Elapsed (ms)',
    'Speed (m/s)',
    'Distance (m)',
    'Heading (deg)',
    'Heading Source',
    'Heading Accuracy (deg)',
    'Heading Quality',
    'Heading Reasons',
    'Source',
    'Quality',
    'Quality Score',
    'Quality Reasons',
    'GPS Accuracy (m)',
    'Fix Age (ms)',
    'Native Speed Used',
    'Moving',
    'Stopped',
    'Stale',
    'Uploaded At',
    'Upload Error',
  ];

  const sampleRows = tripSamples.flatMap(({ samples }) =>
    samples.map((sample) =>
      [
        escCsv(sample.tripId),
        String(sample.sequence),
        escCsv(sample.recordedAt),
        String(Math.round(sample.elapsedMs)),
        sample.speedMps.toFixed(3),
        sample.distanceMeters.toFixed(2),
        sample.headingDegrees == null ? '' : sample.headingDegrees.toFixed(1),
        sample.headingSource,
        sample.headingAccuracyDegrees == null
          ? ''
          : sample.headingAccuracyDegrees.toFixed(1),
        sample.headingQuality,
        escCsv(sample.headingReasons.join('|')),
        sample.source,
        sample.quality,
        sample.qualityScore.toFixed(3),
        escCsv(sample.qualityReasons.join('|')),
        sample.gpsAccuracyMeters == null ? '' : sample.gpsAccuracyMeters.toFixed(1),
        sample.fixAgeMs == null ? '' : String(Math.round(sample.fixAgeMs)),
        sample.nativeSpeedUsed ? '1' : '0',
        sample.isMoving ? '1' : '0',
        sample.isStopped ? '1' : '0',
        sample.stale ? '1' : '0',
        escCsv(sample.uploadedAt ?? ''),
        escCsv(sample.uploadError ?? ''),
      ].join(',')
    )
  );

  return [
    headers.join(','),
    ...rows,
    '',
    sampleHeaders.join(','),
    ...sampleRows,
  ].join('\n');
};
