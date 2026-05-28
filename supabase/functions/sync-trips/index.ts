import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"

type CloudTripInput = {
  id: string
  startedAt: string
  endedAt: string
  totalDistanceMeters: number
  maxSpeedMps: number
  averageSpeedMps: number
  units: "km/h" | "MPH"
  mountLabel?: string | null
  recordStatus?: string
  localUpdatedAt: string
  deletedAt?: string | null
  samples?: Array<Record<string, unknown>>
}

type SyncBody = {
  trips?: CloudTripInput[]
  deletedTripIds?: string[]
  restoreOnly?: boolean
}

const toSampleRow = (
  userId: string,
  tripId: string,
  sample: Record<string, unknown>,
) => ({
  user_id: userId,
  trip_id: tripId,
  sequence: sample.sequence,
  recorded_at: sample.recordedAt,
  elapsed_ms: sample.elapsedMs,
  speed_mps: sample.speedMps,
  distance_meters: sample.distanceMeters,
  heading_degrees: sample.headingDegrees,
  heading_source: sample.headingSource ?? "none",
  heading_accuracy_degrees: sample.headingAccuracyDegrees,
  heading_quality: sample.headingQuality ?? "poor",
  heading_reasons: sample.headingReasons ?? [],
  source: sample.source,
  quality: sample.quality,
  quality_score: sample.qualityScore,
  quality_reasons: sample.qualityReasons ?? [],
  gps_accuracy_meters: sample.gpsAccuracyMeters,
  fix_age_ms: sample.fixAgeMs,
  native_speed_used: sample.nativeSpeedUsed ?? false,
  is_moving: sample.isMoving ?? false,
  is_stopped: sample.isStopped ?? false,
  stale: sample.stale ?? false,
  updated_at: new Date().toISOString(),
})

const toClientTrip = (trip: Record<string, unknown>, samples: unknown[]) => ({
  id: trip.id,
  startedAt: trip.started_at,
  endedAt: trip.ended_at,
  totalDistanceMeters: trip.total_distance_meters,
  maxSpeedMps: trip.max_speed_mps,
  averageSpeedMps: trip.average_speed_mps,
  units: trip.units,
  mountLabel: trip.mount_label,
  recordStatus: trip.record_status,
  localUpdatedAt: trip.local_updated_at,
  deletedAt: trip.deleted_at,
  cloudSyncedAt: trip.updated_at,
  cloudSyncError: null,
  syncStatus: "synced",
  speedSamples: samples.map((sample) => {
    const row = sample as Record<string, unknown>
    return {
      tripId: row.trip_id,
      sequence: row.sequence,
      recordedAt: row.recorded_at,
      elapsedMs: row.elapsed_ms,
      speedMps: row.speed_mps,
      distanceMeters: row.distance_meters,
      headingDegrees: row.heading_degrees,
      headingSource: row.heading_source,
      headingAccuracyDegrees: row.heading_accuracy_degrees,
      headingQuality: row.heading_quality,
      headingReasons: row.heading_reasons ?? [],
      source: row.source,
      quality: row.quality,
      qualityScore: row.quality_score,
      qualityReasons: row.quality_reasons ?? [],
      gpsAccuracyMeters: row.gps_accuracy_meters,
      fixAgeMs: row.fix_age_ms,
      nativeSpeedUsed: row.native_speed_used,
      isMoving: row.is_moving,
      isStopped: row.is_stopped,
      stale: row.stale,
      uploadedAt: row.updated_at,
      uploadError: null,
    }
  }),
})

const updateLeaderboardEntries = async (supabase: any, userId: string) => {
  const { data: profile } = await supabase
    .from("profiles")
    .select("leaderboard_opt_in")
    .eq("user_id", userId)
    .maybeSingle()
  if (!profile?.leaderboard_opt_in) return

  const { data: trips, error } = await supabase
    .from("cloud_trips")
    .select("started_at, total_distance_meters, max_speed_mps, average_speed_mps")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("record_status", "completed")
  if (error) throw error

  const now = Date.now()
  const periods = [
    { period: "week", sinceMs: now - 7 * 24 * 60 * 60 * 1000 },
    { period: "month", sinceMs: now - 30 * 24 * 60 * 60 * 1000 },
    { period: "all_time", sinceMs: 0 },
  ]
  const scopes = ["global", "friends", "nearby"]
  const rows = []
  for (const { period, sinceMs } of periods) {
    const periodTrips = (trips ?? []).filter((trip: Record<string, unknown>) =>
      new Date(String(trip.started_at)).getTime() >= sinceMs
    )
    const distance = periodTrips.reduce(
      (sum: number, trip: Record<string, unknown>) =>
        sum + Number(trip.total_distance_meters ?? 0),
      0,
    )
    const maxSpeed = periodTrips.reduce(
      (max: number, trip: Record<string, unknown>) =>
        Math.max(max, Number(trip.max_speed_mps ?? 0)),
      0,
    )
    const averageSpeed =
      periodTrips.length > 0
        ? periodTrips.reduce(
            (sum: number, trip: Record<string, unknown>) =>
              sum + Number(trip.average_speed_mps ?? 0),
            0,
          ) / periodTrips.length
        : 0

    for (const scope of scopes) {
      rows.push(
        { user_id: userId, metric: "distance", period, scope, value: distance, unit: "m" },
        { user_id: userId, metric: "max_speed", period, scope, value: maxSpeed, unit: "m/s" },
        { user_id: userId, metric: "average_speed", period, scope, value: averageSpeed, unit: "m/s" },
        { user_id: userId, metric: "trip_count", period, scope, value: periodTrips.length, unit: "trips" },
      )
    }
  }
  const { error: upsertError } = await supabase
    .from("leaderboard_entries")
    .upsert(rows, { onConflict: "user_id,metric,period,scope" })
  if (upsertError) throw upsertError
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const body = await readJson<SyncBody>(req)
    const supabase = ctx.supabaseAdmin
    const syncedTripIds: string[] = []

    if (!body.restoreOnly) {
      for (const trip of body.trips ?? []) {
        const { error: tripError } = await supabase.from("cloud_trips").upsert({
          user_id: userId,
          id: trip.id,
          started_at: trip.startedAt,
          ended_at: trip.endedAt,
          total_distance_meters: trip.totalDistanceMeters,
          max_speed_mps: trip.maxSpeedMps,
          average_speed_mps: trip.averageSpeedMps,
          units: trip.units,
          mount_label: trip.mountLabel ?? null,
          record_status: trip.recordStatus ?? "completed",
          local_updated_at: trip.localUpdatedAt,
          deleted_at: trip.deletedAt ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,id" })
        if (tripError) throw tripError

        const samples = (trip.samples ?? []).map((sample) =>
          toSampleRow(userId, trip.id, sample)
        )
        if (samples.length > 0) {
          const { error: sampleError } = await supabase
            .from("cloud_trip_samples")
            .upsert(samples, { onConflict: "user_id,trip_id,sequence" })
          if (sampleError) throw sampleError
        }
        syncedTripIds.push(trip.id)
      }

      for (const tripId of body.deletedTripIds ?? []) {
        const { error } = await supabase.from("cloud_trips").upsert({
          user_id: userId,
          id: tripId,
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          local_updated_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
          units: "km/h",
        }, { onConflict: "user_id,id" })
        if (error) throw error
        syncedTripIds.push(tripId)
      }

      if ((body.trips?.length ?? 0) > 0 || (body.deletedTripIds?.length ?? 0) > 0) {
        await updateLeaderboardEntries(supabase, userId)
      }
    }

    const { data: trips, error: restoreError } = await supabase
      .from("cloud_trips")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(100)
    if (restoreError) throw restoreError

    const restoredTrips = []
    for (const trip of trips ?? []) {
      const { data: samples, error: sampleError } = await supabase
        .from("cloud_trip_samples")
        .select("*")
        .eq("user_id", userId)
        .eq("trip_id", trip.id)
        .order("sequence", { ascending: true })
      if (sampleError) throw sampleError
      restoredTrips.push(toClientTrip(trip, samples ?? []))
    }

    return json({
      syncedTripIds,
      restoredTrips,
      message: "Cloud sync complete.",
    })
  }),
}
