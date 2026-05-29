import {
  buildExportPayload,
  buildTripsCsv,
  parseExportPayload,
  previewImportPayload,
} from '../src/database/exportFormat';
import type { Trip, TripSpeedSample } from '../src/domain/trip';

const trip: Trip = {
  id: 'trip-1',
  startedAt: '2026-05-19T12:00:00.000Z',
  endedAt: '2026-05-19T12:02:00.000Z',
  totalDistanceMeters: 250,
  maxSpeedMps: 15,
  averageSpeedMps: 8,
  units: 'km/h',
  mountLabel: 'top',
};

const sample: TripSpeedSample = {
  tripId: 'trip-1',
  sequence: 1,
  recordedAt: '2026-05-19T12:00:01.000Z',
  elapsedMs: 1000,
  speedMps: 12.5,
  distanceMeters: 12,
  headingDegrees: 91,
  headingSource: 'course',
  headingAccuracyDegrees: 4,
  headingQuality: 'good',
  headingReasons: ['course-used'],
  source: 'blended',
  quality: 'good',
  qualityScore: 0.95,
  qualityReasons: ['native-speed-used'],
  gpsAccuracyMeters: 5,
  fixAgeMs: 100,
  nativeSpeedUsed: true,
  isMoving: true,
  isStopped: false,
  stale: false,
  uploadedAt: null,
  uploadError: null,
};

describe('exportService trip speed samples', () => {
  it('includes per-trip speed samples in JSON payloads', () => {
    const payload = buildExportPayload(
      {
        units: 'km/h',
        mountIndex: 0,
        autoStart: false,
        autoSave: false,
        orientationMode: 'portrait',
      },
      [{ ...trip, speedSamples: [sample] }]
    );

    expect(payload.trips[0]).toMatchObject({
      id: 'trip-1',
      speedSamples: [sample],
    });
  });

  it('includes a speed sample section in CSV output', () => {
    const csv = buildTripsCsv([trip], [{ tripId: trip.id, samples: [sample] }]);

    expect(csv).toContain('Speed Samples');
    expect(csv).toContain('Trip ID,Sequence,Recorded At,Elapsed (ms),Speed (m/s)');
    expect(csv).toContain(
      'trip-1,1,2026-05-19T12:00:01.000Z,1000,12.500,12.00,91.0,course,4.0,good,course-used,blended,good,0.950,native-speed-used,5.0,100,1,1,0,0,,'
    );
  });

  it('validates and previews JSON imports', () => {
    const payload = parseExportPayload(
      buildExportPayload(
        {
          units: 'MPH',
          mountIndex: 1,
          autoStart: true,
          autoSave: false,
          orientationMode: 'auto',
        },
        [{ ...trip, speedSamples: [sample] }]
      )
    );

    expect(previewImportPayload(payload)).toEqual({
      tripsFound: 1,
      samplesFound: 1,
      preferencesFound: true,
    });
    expect(payload.trips[0]).toMatchObject({
      id: 'trip-1',
      speedSamples: [{ tripId: 'trip-1', sequence: 1 }],
    });
  });

  it('rejects files that are not V3l0city JSON exports', () => {
    expect(() => parseExportPayload({ trips: [] })).toThrow(
      'No valid V3l0city trips were found in this file'
    );
    expect(() => parseExportPayload({ hello: 'world' })).toThrow(
      'Choose a V3l0city JSON export file'
    );
  });
});
