import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { getTripsWithSamples, getWebDatabase, saveTripWithSamples } from "@/lib/database";
import type { SpeedSample, WebTrip } from "@/lib/types";

(globalThis as unknown as { window: unknown }).window = globalThis;

const sample: SpeedSample = { tripId: "trip-1", sequence: 0, recordedAt: "2026-01-01T00:00:00Z", elapsedMs: 0, speedMps: 0, distanceMeters: 0, headingDegrees: null, headingSource: "none", headingAccuracyDegrees: null, headingQuality: "good", headingReasons: [], source: "browser-geolocation", quality: "good", qualityScore: 1, qualityReasons: [], gpsAccuracyMeters: 5, fixAgeMs: 0, nativeSpeedUsed: false, isMoving: false, isStopped: true, stale: false };
const trip: WebTrip = { id: "trip-1", userId: "user-1", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z", totalDistanceMeters: 150, maxSpeedMps: 4, averageSpeedMps: 2.5, units: "MPH", mountLabel: null, recordStatus: "completed", localUpdatedAt: "2026-01-01T00:01:00Z", deletedAt: null, cloudSyncedAt: null, cloudSyncError: null, syncStatus: "pending" };

describe("separate browser trip database", () => {
  beforeEach(async () => {
    const db = getWebDatabase();
    await Promise.all([db.trips.clear(), db.samples.clear(), db.preferences.clear(), db.syncOutbox.clear()]);
  });

  it("stores a trip, its derived samples, and a durable sync outbox record", async () => {
    await saveTripWithSamples(trip, [sample]);
    const trips = await getTripsWithSamples("user-1");
    const db = getWebDatabase();
    expect(trips).toHaveLength(1);
    expect(trips[0]?.speedSamples).toEqual([sample]);
    expect((await db.syncOutbox.toArray())[0]).toMatchObject({ tripId: "trip-1", action: "upsert", userId: "user-1" });
  });
});
