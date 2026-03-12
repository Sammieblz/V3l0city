import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Units } from '../utils/speedMath';

const PREFS_KEY = 'velocity.preferences';

export type Preferences = {
  units: Units;
  mountIndex: number;
};

export const getPreferences = async (): Promise<Preferences | null> => {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    if (
      (parsed.units !== 'km/h' && parsed.units !== 'MPH') ||
      typeof parsed.mountIndex !== 'number'
    ) {
      return null;
    }
    return parsed as Preferences;
  } catch {
    return null;
  }
};

export const savePreferences = async (
  prefs: Preferences
): Promise<void> => {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

