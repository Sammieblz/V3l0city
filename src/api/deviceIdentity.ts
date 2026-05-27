import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const INSTALL_ID_KEY = 'v3l0city.telemetry.installId';
const DEVICE_ID_KEY = 'v3l0city.telemetry.deviceId';
const DEVICE_TOKEN_KEY = 'v3l0city.telemetry.deviceToken';
const EXPO_PUSH_TOKEN_KEY = 'v3l0city.notifications.expoPushToken';
const NATIVE_PUSH_TOKEN_KEY = 'v3l0city.notifications.nativePushToken';
const PUSH_PLATFORM_KEY = 'v3l0city.notifications.platform';
const REGISTERED_EXPO_PUSH_TOKEN_KEY =
  'v3l0city.telemetry.registeredExpoPushToken';
const REGISTERED_NATIVE_PUSH_TOKEN_KEY =
  'v3l0city.telemetry.registeredNativePushToken';

export type LocalInstallIdentity = {
  installId: string;
  platform: string;
  appVersion: string;
  buildNumber: string;
  expoPushToken?: string | null;
  nativePushToken?: string | null;
  pushPlatform?: string | null;
};

export type RegisteredDeviceIdentity = LocalInstallIdentity & {
  deviceId: string;
  deviceToken: string;
  registeredExpoPushToken?: string | null;
  registeredNativePushToken?: string | null;
};

const randomHex = async () => {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const getLocalInstallIdentity = async (): Promise<LocalInstallIdentity> => {
  let installId = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (!installId) {
    installId = await randomHex();
    await AsyncStorage.setItem(INSTALL_ID_KEY, installId);
  }

  return {
    installId,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    buildNumber:
      Platform.OS === 'ios'
        ? Constants.expoConfig?.ios?.buildNumber ?? '1'
        : String(Constants.expoConfig?.android?.versionCode ?? '1'),
    expoPushToken: await AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY),
    nativePushToken: await AsyncStorage.getItem(NATIVE_PUSH_TOKEN_KEY),
    pushPlatform: await AsyncStorage.getItem(PUSH_PLATFORM_KEY),
  };
};

export const getRegisteredDeviceIdentity =
  async (): Promise<RegisteredDeviceIdentity | null> => {
    const local = await getLocalInstallIdentity();
    const [
      deviceId,
      deviceToken,
      registeredExpoPushToken,
      registeredNativePushToken,
    ] = await Promise.all([
      AsyncStorage.getItem(DEVICE_ID_KEY),
      AsyncStorage.getItem(DEVICE_TOKEN_KEY),
      AsyncStorage.getItem(REGISTERED_EXPO_PUSH_TOKEN_KEY),
      AsyncStorage.getItem(REGISTERED_NATIVE_PUSH_TOKEN_KEY),
    ]);

    if (!deviceId || !deviceToken) {
      return null;
    }
    return {
      ...local,
      deviceId,
      deviceToken,
      registeredExpoPushToken,
      registeredNativePushToken,
    };
  };

export const saveRegisteredDeviceIdentity = async (
  deviceId: string,
  deviceToken: string,
  pushTokens?: {
    expoPushToken?: string | null;
    nativePushToken?: string | null;
  }
): Promise<void> => {
  await Promise.all([
    AsyncStorage.setItem(DEVICE_ID_KEY, deviceId),
    AsyncStorage.setItem(DEVICE_TOKEN_KEY, deviceToken),
    pushTokens?.expoPushToken
      ? AsyncStorage.setItem(
          REGISTERED_EXPO_PUSH_TOKEN_KEY,
          pushTokens.expoPushToken
        )
      : AsyncStorage.removeItem(REGISTERED_EXPO_PUSH_TOKEN_KEY),
    pushTokens?.nativePushToken
      ? AsyncStorage.setItem(
          REGISTERED_NATIVE_PUSH_TOKEN_KEY,
          pushTokens.nativePushToken
        )
      : AsyncStorage.removeItem(REGISTERED_NATIVE_PUSH_TOKEN_KEY),
  ]);
};

export const savePushNotificationTokens = async (tokens: {
  expoPushToken?: string | null;
  nativePushToken?: string | null;
  platform?: string | null;
}): Promise<void> => {
  await Promise.all([
    tokens.expoPushToken
      ? AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, tokens.expoPushToken)
      : AsyncStorage.removeItem(EXPO_PUSH_TOKEN_KEY),
    tokens.nativePushToken
      ? AsyncStorage.setItem(NATIVE_PUSH_TOKEN_KEY, tokens.nativePushToken)
      : AsyncStorage.removeItem(NATIVE_PUSH_TOKEN_KEY),
    tokens.platform
      ? AsyncStorage.setItem(PUSH_PLATFORM_KEY, tokens.platform)
      : AsyncStorage.removeItem(PUSH_PLATFORM_KEY),
  ]);
};
