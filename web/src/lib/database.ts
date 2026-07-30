"use client";

import Dexie, { type EntityTable, type Table } from "dexie";

import type { SpeedSample, WebTrip } from "@/lib/types";

export type Preference = { key: string; userId: string; value: string; updatedAt: string };
export type SyncOutbox = { id: string; userId: string; tripId: string; action: "upsert" | "delete"; createdAt: string; attempts: number; lastError: string | null };

class V3l0cityWebDatabase extends Dexie {
  trips!: EntityTable<WebTrip, "id">;
  samples!: Table<SpeedSample, [string, number]>;
  preferences!: Table<Preference, [string, string]>;
  syncOutbox!: EntityTable<SyncOutbox, "id">;

  constructor() {
    super("v3l0city-web");
    this.version(1).stores({
      trips: "id, userId, startedAt, localUpdatedAt, syncStatus, deletedAt, [userId+startedAt]",
      samples: "[tripId+sequence], tripId, recordedAt",
      preferences: "[userId+key], userId, key",
      syncOutbox: "id, userId, tripId, action, createdAt",
    });
  }
}

let webDatabase: V3l0cityWebDatabase | undefined;

export function getWebDatabase() {
  if (typeof window === "undefined") throw new Error("Browser storage is available only in a browser.");
  webDatabase ??= new V3l0cityWebDatabase();
  return webDatabase;
}

export async function saveTripWithSamples(trip: WebTrip, samples: SpeedSample[]) {
  const db = getWebDatabase();
  await db.transaction("rw", db.trips, db.samples, db.syncOutbox, async () => {
    await db.trips.put(trip);
    await db.samples.bulkPut(samples);
    await db.syncOutbox.put({
      id: crypto.randomUUID(),
      userId: trip.userId,
      tripId: trip.id,
      action: "upsert",
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    });
  });
}

export async function getTripsWithSamples(userId: string) {
  const db = getWebDatabase();
  const trips = await db.trips.where("userId").equals(userId).filter((trip) => !trip.deletedAt).reverse().sortBy("startedAt");
  return Promise.all(trips.map(async (trip) => ({ ...trip, speedSamples: await db.samples.where("tripId").equals(trip.id).sortBy("sequence") })));
}

export async function clearBrowserData(userId: string) {
  const db = getWebDatabase();
  const trips = await db.trips.where("userId").equals(userId).toArray();
  await db.transaction("rw", db.trips, db.samples, db.preferences, db.syncOutbox, async () => {
    await db.samples.bulkDelete((await Promise.all(trips.map((trip) => db.samples.where("tripId").equals(trip.id).primaryKeys()))).flat());
    await db.trips.bulkDelete(trips.map((trip) => trip.id));
    await db.preferences.where("userId").equals(userId).delete();
    await db.syncOutbox.where("userId").equals(userId).delete();
  });
}
