import type { Trip, TripSpeedSample } from '../domain/trip';
import type { Preferences } from './preferencesRepository';

const escCsv = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export type TripWithSpeedSamples = Trip & {
  speedSamples: TripSpeedSample[];
};

export const buildExportPayload = (
  preferences: Preferences | null,
  trips: TripWithSpeedSamples[]
) => ({ preferences, trips });

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
