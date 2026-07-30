"use client";

import { getTripsWithSamples, getWebDatabase } from "@/lib/database";
import { createClient } from "@/lib/supabase/client";
import type { TripWithSamples, WebTrip } from "@/lib/types";

type SyncResponse = { syncedTripIds: string[]; restoredTrips: Array<Omit<WebTrip, "userId"> & { speedSamples: TripWithSamples["speedSamples"] }>; message: string };

const serializeTrip = (trip: TripWithSamples) => ({
  id: trip.id,
  startedAt: trip.startedAt,
  endedAt: trip.endedAt,
  totalDistanceMeters: trip.totalDistanceMeters,
  maxSpeedMps: trip.maxSpeedMps,
  averageSpeedMps: trip.averageSpeedMps,
  units: trip.units,
  mountLabel: null,
  recordStatus: "completed",
  localUpdatedAt: trip.localUpdatedAt,
  deletedAt: trip.deletedAt,
  samples: trip.speedSamples,
});

export async function restoreCloudTrips(userId: string) {
  const supabase = createClient();
  if (!supabase) throw new Error("Cloud features are not configured.");
  const { data, error } = await supabase.functions.invoke<SyncResponse>("sync-trips", { body: { restoreOnly: true } });
  if (error) throw error;
  const response = data ?? { syncedTripIds: [], restoredTrips: [], message: "Cloud sync complete." };
  const db = getWebDatabase();
  await db.transaction("rw", db.trips, db.samples, async () => {
    for (const restored of response.restoredTrips ?? []) {
      const local = await db.trips.get(restored.id);
      if (local && new Date(local.localUpdatedAt) > new Date(restored.localUpdatedAt)) continue;
      await db.trips.put({ ...restored, userId, syncStatus: "synced", cloudSyncedAt: restored.cloudSyncedAt ?? new Date().toISOString(), cloudSyncError: null });
      await db.samples.where("tripId").equals(restored.id).delete();
      await db.samples.bulkPut(restored.speedSamples ?? []);
    }
  });
  return response.restoredTrips.length;
}

export async function syncPendingTrips(userId: string) {
  const supabase = createClient();
  if (!supabase) throw new Error("Cloud features are not configured.");
  const db = getWebDatabase();
  const pending = await db.trips.where("userId").equals(userId).filter((trip) => trip.syncStatus !== "synced").toArray();
  if (!pending.length) return 0;
  const allTrips = await getTripsWithSamples(userId);
  const pendingIds = new Set(pending.map((trip) => trip.id));
  const payload = allTrips.filter((trip) => pendingIds.has(trip.id));
  const { data, error } = await supabase.functions.invoke<SyncResponse>("sync-trips", { body: { trips: payload.map(serializeTrip), deletedTripIds: [] } });
  if (error) {
    await db.trips.bulkPut(pending.map((trip) => ({ ...trip, syncStatus: "failed" as const, cloudSyncError: error.message })));
    throw error;
  }
  const response = data ?? { syncedTripIds: [], restoredTrips: [], message: "Cloud sync complete." };
  const syncedAt = new Date().toISOString();
  await db.transaction("rw", db.trips, db.syncOutbox, async () => {
    for (const tripId of response.syncedTripIds ?? []) {
      const trip = await db.trips.get(tripId);
      if (trip) await db.trips.put({ ...trip, syncStatus: "synced", cloudSyncedAt: syncedAt, cloudSyncError: null });
      await db.syncOutbox.where("tripId").equals(tripId).delete();
    }
  });
  return response.syncedTripIds.length;
}
