import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip } from '../domain/trip';

const TRIPS_KEY = 'velocity.trips';

export const getTrips = async (): Promise<Trip[]> => {
  try {
    const raw = await AsyncStorage.getItem(TRIPS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as Trip[];
  } catch {
    return [];
  }
};

export const saveTrip = async (trip: Trip): Promise<void> => {
  const existing = await getTrips();
  const next = [trip, ...existing];
  await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(next));
};

export const deleteTrip = async (id: string): Promise<void> => {
  const existing = await getTrips();
  const next = existing.filter((trip) => trip.id !== id);
  await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(next));
};

export const clearTrips = async (): Promise<void> => {
  await AsyncStorage.removeItem(TRIPS_KEY);
};

