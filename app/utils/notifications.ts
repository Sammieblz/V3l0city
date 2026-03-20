import * as Notifications from 'expo-notifications';

import type { Trip } from '../domain/trip';

let permissionsRequested = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const ensureNotificationPermissions = async (): Promise<boolean> => {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }

    if (permissionsRequested) {
      return false;
    }
    permissionsRequested = true;

    const res = await Notifications.requestPermissionsAsync();
    return res.granted || res.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
};

export const scheduleTripSavedNotification = async (trip: Trip) => {
  const ok = await ensureNotificationPermissions();
  if (!ok) {
    return;
  }

  const start = new Date(trip.startedAt);
  const end = new Date(trip.endedAt);
  const durationMin = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );
  const distanceKm = trip.totalDistanceMeters / 1000;

  const unitsLabel = trip.units;

  const title = 'V3locity trip saved';
  const body = `${distanceKm.toFixed(1)} ${
    unitsLabel === 'km/h' ? 'km' : 'mi'
  } in ${durationMin} min`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger: null,
  });
};

