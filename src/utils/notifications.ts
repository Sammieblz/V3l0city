import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { savePushNotificationTokens } from '../api/deviceIdentity';
import type { Trip } from '../domain/trip';

const TRIP_NOTIFICATION_CHANNEL_ID = 'v3l0city_trips';
const NOTIFICATION_ACCENT_COLOR = '#00E5FF';

type NotificationsModule = typeof import('expo-notifications');

let permissionsRequested = false;
let handlerConfigured = false;
let androidChannelConfigured = false;
let notificationsPromise: Promise<NotificationsModule | null> | null = null;

export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

export type PushNotificationRegistrationResult = {
  ok: boolean;
  permission: NotificationPermissionState;
  expoPushToken?: string | null;
  nativePushToken?: string | null;
  message: string;
};

const getProjectId = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as
    | {
        eas?: { projectId?: string };
        projectId?: string;
      }
    | undefined;

  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.easConfig?.projectId ??
    extra?.eas?.projectId ??
    extra?.projectId
  );
};

const normalizePermissionState = (
  Notifications: NotificationsModule,
  status: Awaited<ReturnType<NotificationsModule['getPermissionsAsync']>>
): NotificationPermissionState => {
  if (
    status.granted ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }

  return status.canAskAgain ? 'undetermined' : 'denied';
};

const configureAndroidChannel = async (Notifications: NotificationsModule) => {
  if (Platform.OS !== 'android' || androidChannelConfigured) {
    return;
  }

  await Notifications.setNotificationChannelAsync(TRIP_NOTIFICATION_CHANNEL_ID, {
    name: 'V3l0city trip alerts',
    description: 'Trip saved alerts and V3l0city push notifications.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: NOTIFICATION_ACCENT_COLOR,
    enableLights: true,
    enableVibrate: false,
    showBadge: false,
  });
  androidChannelConfigured = true;
};

const getNotifications = async () => {
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    return null;
  }

  notificationsPromise ??= import('expo-notifications')
    .then((Notifications) => {
      if (!handlerConfigured) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        handlerConfigured = true;
      }
      return Notifications;
    })
    .catch(() => null);

  const Notifications = await notificationsPromise;
  if (Notifications) {
    await configureAndroidChannel(Notifications);
  }

  return Notifications;
};

export const ensureNotificationPermissions = async (): Promise<boolean> => {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) {
      return false;
    }

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

export const getNotificationPermissionState =
  async (): Promise<NotificationPermissionState> => {
    try {
      const Notifications = await getNotifications();
      if (!Notifications) {
        return 'unsupported';
      }

      const existing = await Notifications.getPermissionsAsync();
      return normalizePermissionState(Notifications, existing);
    } catch {
      return 'unsupported';
    }
  };

export const registerForPushNotifications =
  async (): Promise<PushNotificationRegistrationResult> => {
    try {
      const Notifications = await getNotifications();
      if (!Notifications) {
        return {
          ok: false,
          permission: 'unsupported',
          message:
            Platform.OS === 'android'
              ? 'Notifications require a development or production build on Android.'
              : 'Notifications are not available in this runtime.',
        };
      }

      const permissionGranted = await ensureNotificationPermissions();
      const permission = await getNotificationPermissionState();
      if (!permissionGranted || permission !== 'granted') {
        return {
          ok: false,
          permission,
          message: 'Notification permission was not granted.',
        };
      }

      let devicePushToken: Awaited<
        ReturnType<NotificationsModule['getDevicePushTokenAsync']>
      > | null = null;
      try {
        devicePushToken = await Notifications.getDevicePushTokenAsync();
      } catch {
        return {
          ok: true,
          permission,
          message:
            'Local notifications are enabled. Push tokens need APNs/FCM credentials in the build.',
        };
      }

      const nativePushToken =
        typeof devicePushToken.data === 'string'
          ? devicePushToken.data
          : JSON.stringify(devicePushToken.data);
      const projectId = getProjectId();
      let expoPushToken: string | null = null;
      let message = 'Push notifications enabled.';

      if (projectId) {
        try {
          const token = await Notifications.getExpoPushTokenAsync({
            projectId,
            devicePushToken,
          });
          expoPushToken = token.data;
        } catch {
          message =
            'Native push token saved. Expo push token is unavailable for this build.';
        }
      } else {
        message =
          'Native push token saved. Add an EAS project ID for Expo push delivery.';
      }

      await savePushNotificationTokens({
        expoPushToken,
        nativePushToken,
        platform: devicePushToken.type,
      });

      return {
        ok: true,
        permission,
        expoPushToken,
        nativePushToken,
        message,
      };
    } catch {
      return {
        ok: false,
        permission: 'unsupported',
        message: 'Notifications could not be enabled.',
      };
    }
  };

export const scheduleTripSavedNotification = async (trip: Trip) => {
  try {
    const Notifications = await getNotifications();
    const ok = Notifications ? await ensureNotificationPermissions() : false;
    if (!Notifications || !ok) {
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

    const title = 'V3l0city trip saved';
    const body = `${distanceKm.toFixed(1)} ${
      unitsLabel === 'km/h' ? 'km' : 'mi'
    } in ${durationMin} min`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        color: NOTIFICATION_ACCENT_COLOR,
        data: {
          type: 'trip_saved',
          tripId: trip.id,
        },
        sound: false,
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: TRIP_NOTIFICATION_CHANNEL_ID }
          : null,
    });
  } catch {
    // Trip-saved notifications are optional and should never interrupt saving.
  }
};
