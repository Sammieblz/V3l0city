import * as Location from 'expo-location';
import ngeohash from 'ngeohash';

import {
  getCoarseLocation,
  getCoarseLocationHash,
} from '../src/cloud/utils/coarseLocation';

jest.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
  },
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));

jest.mock('ngeohash', () => ({
  __esModule: true,
  default: {
    encode: jest.fn(
      (latitude: number, longitude: number, precision: number) =>
        `hash:${latitude}:${longitude}:${precision}`,
    ),
  },
}));

const mockLocation = Location as jest.Mocked<typeof Location>;
const mockGeohash = ngeohash as jest.Mocked<typeof ngeohash>;

const grantedPermission = {
  canAskAgain: true,
  expires: 'never',
  granted: true,
  status: 'granted',
};

const makePosition = (latitude: number, longitude: number) =>
  ({
    coords: {
      accuracy: 20,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude,
      longitude,
      speed: null,
    },
    timestamp: 1000,
  }) as Location.LocationObject;

describe('coarse location utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns permission_denied when foreground location is not granted', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      ...grantedPermission,
      granted: false,
      status: 'denied',
    } as Location.LocationPermissionResponse);

    await expect(getCoarseLocation()).resolves.toEqual({
      hash: null,
      ok: false,
      reason: 'permission_denied',
    });
    expect(mockLocation.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('uses a recent last known location before requesting a live fix', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      grantedPermission as Location.LocationPermissionResponse,
    );
    mockLocation.getLastKnownPositionAsync.mockResolvedValue(
      makePosition(40.7, -74),
    );

    await expect(getCoarseLocation()).resolves.toEqual({
      hash: 'hash:40.7:-74:5',
      ok: true,
    });
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(mockGeohash.encode).toHaveBeenCalledWith(40.7, -74, 5);
  });

  it('falls back to a current location when no last known fix exists', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      grantedPermission as Location.LocationPermissionResponse,
    );
    mockLocation.getLastKnownPositionAsync.mockResolvedValue(null);
    mockLocation.getCurrentPositionAsync.mockResolvedValue(
      makePosition(34.05, -118.24),
    );

    await expect(getCoarseLocationHash()).resolves.toBe(
      'hash:34.05:-118.24:5',
    );
    expect(mockLocation.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });
  });

  it('returns unavailable when the device cannot provide a location', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue(
      grantedPermission as Location.LocationPermissionResponse,
    );
    mockLocation.getLastKnownPositionAsync.mockResolvedValue(null);
    mockLocation.getCurrentPositionAsync.mockRejectedValue(
      new Error('location unavailable'),
    );

    await expect(getCoarseLocation()).resolves.toEqual({
      hash: null,
      ok: false,
      reason: 'unavailable',
    });
    await expect(getCoarseLocationHash()).resolves.toBeNull();
  });
});
