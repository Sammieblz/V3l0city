import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Location from 'expo-location';
import * as NativeSpeedEngine from 'v3l0city-speed-engine';

import {
  useVelocitySensors,
  type VelocitySensorsState,
} from '../src/hooks/useVelocitySensors';
import type {
  SpeedErrorEvent,
  SpeedUpdateEvent,
} from 'v3l0city-speed-engine';

let mockSpeedUpdateListener: ((event: SpeedUpdateEvent) => void) | null = null;
let mockSpeedErrorListener: ((event: SpeedErrorEvent) => void) | null = null;
let mockLocationListener: ((location: {
  coords: Location.LocationObjectCoords;
  timestamp: number;
}) => void) | null = null;
let renderer: ReactTestRenderer | undefined;

jest.mock('v3l0city-speed-engine', () => ({
  isAvailable: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
  setTripAccumulation: jest.fn(),
  setMountOffsetDegrees: jest.fn(),
  addSpeedUpdateListener: jest.fn((listener) => {
    mockSpeedUpdateListener = listener;
    return { remove: jest.fn() };
  }),
  addSpeedErrorListener: jest.fn((listener) => {
    mockSpeedErrorListener = listener;
    return { remove: jest.fn() };
  }),
}));

jest.mock('expo-location', () => ({
  Accuracy: {
    BestForNavigation: 6,
  },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn((_options, listener) => {
    mockLocationListener = listener;
    return Promise.resolve({ remove: jest.fn() });
  }),
  watchHeadingAsync: jest.fn(() => Promise.resolve({ remove: jest.fn() })),
}));

jest.mock('expo-sensors', () => ({
  DeviceMotion: {
    isAvailableAsync: jest.fn(() => Promise.resolve(false)),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(),
  },
}));

const baseCoords: Location.LocationObjectCoords = {
  latitude: 0,
  longitude: 0,
  altitude: 0,
  accuracy: 5,
  altitudeAccuracy: 0,
  heading: 0,
  speed: null,
};

type ProbeProps = {
  accumulateTrip?: boolean;
  simulationEnabled?: boolean;
  onState: (state: VelocitySensorsState, reset: () => void) => void;
};

function HookProbe({
  accumulateTrip = true,
  simulationEnabled = false,
  onState,
}: ProbeProps) {
  const { state, reset } = useVelocitySensors({
    mountOffsetDegrees: 7,
    accumulateTrip,
    simulationEnabled,
  });

  useEffect(() => {
    onState(state, reset);
  }, [onState, reset, state]);

  return null;
}

describe('useVelocitySensors native speed engine integration', () => {
  const native = NativeSpeedEngine as jest.Mocked<typeof NativeSpeedEngine>;
  const location = Location as jest.Mocked<typeof Location>;

  beforeEach(() => {
    jest.clearAllMocks();
    renderer = undefined;
    mockSpeedUpdateListener = null;
    mockSpeedErrorListener = null;
    mockLocationListener = null;
    native.isAvailable.mockReturnValue(true);
    native.start.mockResolvedValue();
    native.stop.mockResolvedValue();
    native.reset.mockResolvedValue();
    native.setTripAccumulation.mockResolvedValue();
    native.setMountOffsetDegrees.mockResolvedValue();
    location.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted' as Location.PermissionStatus,
      canAskAgain: true,
      expires: 'never',
      granted: true,
    });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
        await Promise.resolve();
      });
    }
    jest.useRealTimers();
  });

  it('consumes native speedUpdate events', async () => {
    const states: VelocitySensorsState[] = [];

    await act(async () => {
      renderer = create(<HookProbe onState={(state) => states.push(state)} />);
      await Promise.resolve();
    });

    expect(native.start).toHaveBeenCalledWith({
      mountOffsetDegrees: 7,
      accumulateTrip: true,
      staleTimeoutMs: 3000,
      outputRateHz: 10,
    });

    await act(async () => {
      mockSpeedUpdateListener?.({
        speedMps: 12,
        averageSpeedMps: 8,
        maxSpeedMps: 13,
        distanceMeters: 120,
        headingDegrees: 92,
        headingSource: 'course',
        headingAccuracyDegrees: 3,
        headingQuality: 'good',
        headingReasons: ['course-used'],
        source: 'blended',
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
        gpsAccuracyMeters: 5,
        fixAgeMs: 0,
        nativeSpeedUsed: true,
      });
    });

    expect(states.at(-1)).toMatchObject({
      speedMps: 12,
      averageSpeedMps: 8,
      maxSpeedMps: 13,
      distanceMeters: 120,
      headingDegrees: 92,
      headingSource: 'course',
      headingAccuracyDegrees: 3,
      headingQuality: 'good',
      headingReasons: ['course-used'],
      status: 'ready',
      source: 'blended',
      quality: 'good',
      stale: false,
      timestampMs: 1000,
      qualityScore: 0.95,
      qualityReasons: ['native-speed-used'],
      gpsAccuracyMeters: 5,
      fixAgeMs: 0,
      nativeSpeedUsed: true,
      gpsAvailable: true,
      motionAvailable: true,
      headingAvailable: true,
      isMoving: true,
    });
  });

  it('forwards trip accumulation pause and resume to native', async () => {
    await act(async () => {
      renderer = create(<HookProbe onState={jest.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      renderer?.update(<HookProbe accumulateTrip={false} onState={jest.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      renderer?.update(<HookProbe accumulateTrip onState={jest.fn()} />);
      await Promise.resolve();
    });

    expect(native.setTripAccumulation).toHaveBeenCalledWith(false);
    expect(native.setTripAccumulation).toHaveBeenCalledWith(true);
  });

  it('falls back to JS sensors when the native module is unavailable', async () => {
    native.isAvailable.mockReturnValue(false);
    const states: VelocitySensorsState[] = [];

    await act(async () => {
      renderer = create(<HookProbe onState={(state) => states.push(state)} />);
      await Promise.resolve();
    });

    expect(native.start).not.toHaveBeenCalled();
    expect(location.watchPositionAsync).toHaveBeenCalled();

    await act(async () => {
      mockLocationListener?.({
        coords: baseCoords,
        timestamp: 1000,
      });
      mockLocationListener?.({
        coords: {
          ...baseCoords,
          longitude: 0.0001,
        },
        timestamp: 2000,
      });
    });

    expect(states.at(-1)?.source).toBe('gps');
    expect(states.at(-1)?.speedMps).toBeGreaterThan(0);
    expect(states.at(-1)?.gpsAvailable).toBe(true);
  });

  it('runs a dev drive simulation without native or platform sensors', async () => {
    jest.useFakeTimers({ now: 0 });
    const states: VelocitySensorsState[] = [];

    await act(async () => {
      renderer = create(
        <HookProbe
          simulationEnabled
          onState={(state) => states.push(state)}
        />
      );
      await Promise.resolve();
    });

    expect(native.start).not.toHaveBeenCalled();
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      permission: 'granted',
      status: 'ready',
      quality: 'good',
      source: 'blended',
      qualityScore: 0.98,
      qualityReasons: ['simulated-drive'],
      headingSource: 'device',
      headingAccuracyDegrees: 12,
      headingQuality: 'good',
      headingReasons: ['low-speed-course-ignored', 'device-heading-used'],
      gpsAvailable: true,
      motionAvailable: true,
      headingAvailable: true,
    });

    await act(async () => {
      jest.advanceTimersByTime(9000);
      await Promise.resolve();
    });

    expect(states.at(-1)?.speedMps).toBeGreaterThan(10);
    expect(states.at(-1)?.distanceMeters).toBeGreaterThan(20);
  });

  it('maps precise-location-required native errors to a distinct status', async () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const states: VelocitySensorsState[] = [];

    await act(async () => {
      renderer = create(<HookProbe onState={(state) => states.push(state)} />);
      await Promise.resolve();
    });

    await act(async () => {
      mockSpeedErrorListener?.({
        code: 'precise_location_required',
        message: 'Precise location is required.',
        recoverable: true,
      });
    });

    expect(states.at(-1)).toMatchObject({
      status: 'precise_location_required',
      permission: 'precise_required',
      headingSource: 'none',
      headingQuality: 'poor',
      headingReasons: ['precise-location-required', 'no-heading'],
    });
    warnSpy.mockRestore();
  });
});
