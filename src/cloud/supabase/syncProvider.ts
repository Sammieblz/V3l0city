import type { TripWithSpeedSamples } from '../../domain/trip';
import type {
  CloudAuthSession,
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
    payload: CloudTripSyncPayload,
    session: Readonly<CloudAuthSession>,
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
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: {
          trips: payload.trips.map(toCloudTripPayload),
          deletedTripIds: payload.deletedTripIds,
        },
      }
    );
    if (error) throw error;

    return {
      ok: true,
      // The archived edge endpoint returns upload and successful tombstone IDs
      // in one array. Partition by the mutations actually sent by this adapter.
      syncedTripIds: (data?.syncedTripIds ?? []).filter((id) => payload.trips.some((trip) => trip.id === id)),
      deletedTripIds: (data?.syncedTripIds ?? []).filter((id) => payload.deletedTripIds.includes(id)),
      restoredTrips: data?.restoredTrips ?? [],
      message: data?.message ?? 'Cloud sync complete.',
    };
  }

  async restoreCloudTrips(session: Readonly<CloudAuthSession>): Promise<TripWithSpeedSamples[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.functions.invoke<SyncTripsResponse>(
      'sync-trips',
      { headers: { Authorization: `Bearer ${session.accessToken}` },
        body: { trips: [], deletedTripIds: [], restoreOnly: true } }
    );
    if (error) throw error;
    return data?.restoredTrips ?? [];
  }
}
