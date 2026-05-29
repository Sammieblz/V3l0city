import type { TripWithSpeedSamples } from '../../domain/trip';
import type {
  CloudSyncProvider,
  CloudSyncResult,
  CloudTripSyncPayload,
} from '../types';
import { getSupabaseClient } from './client';
import { toCloudTripPayload } from './mappers';

type SyncTripsResponse = {
  syncedTripIds?: string[];
  restoredTrips?: TripWithSpeedSamples[];
  message?: string;
};

export class SupabaseSyncProvider implements CloudSyncProvider {
  async syncLocalChanges(
    payload: CloudTripSyncPayload
  ): Promise<CloudSyncResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        ok: false,
        syncedTripIds: [],
        restoredTrips: [],
        message: 'Online sync is not available in this build.',
      };
    }

    const { data, error } = await supabase.functions.invoke<SyncTripsResponse>(
      'sync-trips',
      {
        body: {
          trips: payload.trips.map(toCloudTripPayload),
          deletedTripIds: payload.deletedTripIds,
        },
      }
    );
    if (error) throw error;

    return {
      ok: true,
      syncedTripIds: data?.syncedTripIds ?? [],
      restoredTrips: data?.restoredTrips ?? [],
      message: data?.message ?? 'Cloud sync complete.',
    };
  }

  async restoreCloudTrips(): Promise<TripWithSpeedSamples[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.functions.invoke<SyncTripsResponse>(
      'sync-trips',
      { body: { trips: [], deletedTripIds: [], restoreOnly: true } }
    );
    if (error) throw error;
    return data?.restoredTrips ?? [];
  }
}
