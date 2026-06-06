import {
  buildCarDisplayModel,
  numericSpeedForCarModel,
} from '../src/car/carDisplayModel';
import type { CarTripControllerStatus } from '../src/car/carActions';
import type { DriveSurfaceSnapshot } from '../src/driveSurface/snapshot';

const controllerReady: CarTripControllerStatus = {
  available: true,
  tripActive: false,
  tripPaused: false,
  canStart: true,
  canPause: false,
  canResume: false,
  canStop: false,
};

const snapshot: DriveSurfaceSnapshot = {
  schemaVersion: 1,
  tripId: 'trip-1',
  tripActive: true,
  tripPaused: false,
  speedMps: 12,
  speedText: '27',
  units: 'MPH',
  distanceMeters: 804,
  distanceText: '0.5 mi',
  averageSpeedMps: 10,
  averageSpeedText: '22',
  maxSpeedMps: 20,
  maxSpeedText: '45',
  elapsedMs: 69_000,
  elapsedText: '00:01:09',
  headingDegrees: 205,
  headingText: '205°',
  headingSource: 'course',
  headingQuality: 'good',
  signalQuality: 'good',
  signalText: 'Good',
  stale: false,
  permissionStatus: 'ready',
  updatedAtMs: 10_000,
  simulationActive: true,
};

describe('car display model', () => {
  it('maps an active trip into cockpit display values and controls', () => {
    const model = buildCarDisplayModel(
      snapshot,
      {
        ...controllerReady,
        tripActive: true,
        canStart: false,
        canPause: true,
        canStop: true,
      },
      11_000,
    );

    expect(model.live).toBe(true);
    expect(model.title).toBe('Simulated trip active');
    expect(model.speedText).toBe('27');
    expect(model.maxSpeedText).toBe('45');
    expect(model.headingText).toBe('205°');
    expect(model.actions.map((action) => action.label)).toEqual([
      'Pause',
      'Stop & Save',
    ]);
    expect(numericSpeedForCarModel(model)).toBe(27);
  });

  it('uses resume and stop actions for paused trips', () => {
    const model = buildCarDisplayModel(
      { ...snapshot, tripPaused: true },
      {
        ...controllerReady,
        tripActive: true,
        tripPaused: true,
        canStart: false,
        canResume: true,
        canStop: true,
      },
      11_000,
    );

    expect(model.title).toBe('Trip paused');
    expect(model.actions.map((action) => action.action)).toEqual([
      'resume',
      'stop-save',
    ]);
    expect(model.actions.every((action) => action.enabled)).toBe(true);
  });

  it('dims stale or missing drive state but still exposes start when available', () => {
    const missing = buildCarDisplayModel(null, controllerReady, 11_000);
    expect(missing.live).toBe(false);
    expect(missing.speedText).toBe('--');
    expect(missing.actions).toEqual([
      {
        action: 'start',
        label: 'Start Trip',
        kind: 'primary',
        enabled: true,
      },
    ]);

    const stale = buildCarDisplayModel(snapshot, controllerReady, 20_000);
    expect(stale.stale).toBe(true);
    expect(stale.speedText).toBe('--');
  });

  it('disables start and resume when precise location or sensors need attention', () => {
    const denied = buildCarDisplayModel(
      {
        ...snapshot,
        tripActive: false,
        permissionStatus: 'precise_location_required',
        signalText: 'Precise needed',
      },
      controllerReady,
      11_000,
    );

    expect(denied.controlMessage).toBe('Precise needed');
    expect(denied.actions[0]).toMatchObject({
      action: 'start',
      enabled: false,
    });
  });
});
