import {
  buildDriveSurfaceSnapshot,
  getDriveSurfaceWidgetStatusText,
  isDriveSurfaceSnapshotStale,
  parseDriveSurfaceSnapshot,
  serializeDriveSurfaceSnapshot,
} from '../src/driveSurface/snapshot';
import type { VelocitySensorsState } from '../src/hooks/useVelocitySensors';

const baseState: VelocitySensorsState = {
  speedMps: 10,
  averageSpeedMps: 8,
  maxSpeedMps: 14,
  distanceMeters: 1200,
  headingDegrees: 91,
  headingSource: 'course',
  headingAccuracyDegrees: 6,
  headingQuality: 'good',
  headingReasons: ['course-used'],
  source: 'gps',
  quality: 'good',
  isMoving: true,
  isStopped: false,
  stale: false,
  gpsAvailable: true,
  motionAvailable: true,
  headingAvailable: true,
  timestampMs: 1000,
  qualityScore: 0.95,
  qualityReasons: ['native-speed-used'],
  gpsAccuracyMeters: 4,
  fixAgeMs: 100,
  nativeSpeedUsed: true,
  permission: 'granted',
  status: 'ready',
  errorMessage: null,
  units: 'MPH',
};

describe('drive surface snapshots', () => {
  it('builds formatted widget-safe trip data', () => {
    const snapshot = buildDriveSurfaceSnapshot({
      state: baseState,
      units: 'MPH',
      tripId: 'trip-1',
      tripActive: true,
      tripPaused: false,
      distanceMeters: 1609.344,
      averageSpeedMps: 8,
      maxSpeedMps: 14,
      elapsedMs: 3_723_000,
      nowMs: 10_000,
    });

    expect(snapshot).toMatchObject({
      tripId: 'trip-1',
      tripActive: true,
      speedText: '22',
      units: 'MPH',
      distanceText: '1.0 mi',
      averageSpeedText: '18',
      maxSpeedText: '31',
      elapsedText: '01:02:03',
      headingText: '91°',
      signalText: 'Good',
      simulationActive: false,
    });
  });

  it('round-trips through JSON', () => {
    const snapshot = buildDriveSurfaceSnapshot({
      state: baseState,
      units: 'km/h',
      tripId: null,
      tripActive: false,
      tripPaused: false,
      distanceMeters: 0,
      averageSpeedMps: 0,
      maxSpeedMps: 0,
      elapsedMs: 0,
      simulationActive: true,
      nowMs: 10_000,
    });

    expect(snapshot.simulationActive).toBe(true);

    expect(parseDriveSurfaceSnapshot(serializeDriveSurfaceSnapshot(snapshot))).toEqual(
      snapshot,
    );
    expect(parseDriveSurfaceSnapshot('nope')).toBeNull();
  });

  it('marks old or engine-stale snapshots as stale', () => {
    const snapshot = buildDriveSurfaceSnapshot({
      state: baseState,
      units: 'km/h',
      tripId: null,
      tripActive: false,
      tripPaused: false,
      distanceMeters: 0,
      averageSpeedMps: 0,
      maxSpeedMps: 0,
      elapsedMs: 0,
      nowMs: 10_000,
    });

    expect(isDriveSurfaceSnapshotStale(snapshot, 12_000)).toBe(false);
    expect(isDriveSurfaceSnapshotStale(snapshot, 16_001)).toBe(true);
    expect(isDriveSurfaceSnapshotStale({ ...snapshot, stale: true }, 12_000)).toBe(
      true,
    );
  });

  it('uses simple status text for widgets and car glances', () => {
    const snapshot = buildDriveSurfaceSnapshot({
      state: baseState,
      units: 'km/h',
      tripId: 'trip-1',
      tripActive: true,
      tripPaused: false,
      distanceMeters: 0,
      averageSpeedMps: 0,
      maxSpeedMps: 0,
      elapsedMs: 0,
      nowMs: 10_000,
    });

    expect(getDriveSurfaceWidgetStatusText(snapshot, 11_000)).toBe('Trip active');
    expect(getDriveSurfaceWidgetStatusText({ ...snapshot, tripPaused: true }, 11_000)).toBe(
      'Trip paused',
    );
    expect(getDriveSurfaceWidgetStatusText(snapshot, 20_000)).toBe(
      'Open V3l0city to start tracking',
    );
  });
});
