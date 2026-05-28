import * as Location from 'expo-location';
import ngeohash from 'ngeohash';

const GEOHASH_PRECISION = 5;
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 5000;
const CURRENT_LOCATION_TIMEOUT_MS = 8000;

export type CoarseLocationResult =
  | {
      hash: string;
      ok: true;
    }
  | {
      hash: null;
      ok: false;
      reason: 'permission_denied' | 'unavailable';
    };

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Location request timed out.')),
      timeoutMs
    );

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });

export const getCoarseLocation = async (): Promise<CoarseLocationResult> => {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { hash: null, ok: false, reason: 'permission_denied' };
    }

    const position =
      (await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
        requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
      })) ??
      (await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        }),
        CURRENT_LOCATION_TIMEOUT_MS
      ));

    return {
      hash: ngeohash.encode(
        position.coords.latitude,
        position.coords.longitude,
        GEOHASH_PRECISION
      ),
      ok: true,
    };
  } catch {
    return { hash: null, ok: false, reason: 'unavailable' };
  }
};

export const getCoarseLocationHash = async (): Promise<string | null> => {
  const result = await getCoarseLocation();
  return result.ok ? result.hash : null;
};
