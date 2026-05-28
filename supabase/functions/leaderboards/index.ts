import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"

type Metric = "distance" | "average_speed" | "max_speed" | "trip_count"
type Period = "week" | "month" | "all_time"
type Scope = "global" | "friends" | "nearby"

type ProfileRow = {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
}

type CloudTripRow = {
  user_id: string
  started_at: string
  ended_at: string | null
  total_distance_meters: number | null
  max_speed_mps: number | null
  average_speed_mps: number | null
}

const validMetric = (value: unknown): value is Metric =>
  value === "distance" ||
  value === "average_speed" ||
  value === "max_speed" ||
  value === "trip_count"

const validPeriod = (value: unknown): value is Period =>
  value === "week" || value === "month" || value === "all_time"

const validScope = (value: unknown): value is Scope =>
  value === "global" || value === "friends" || value === "nearby"

const periodStartIso = (period: Period) => {
  if (period === "all_time") return null
  const now = Date.now()
  const days = period === "week" ? 7 : 30
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
}

const valueForMetric = (metric: Metric, trips: CloudTripRow[]) => {
  if (metric === "trip_count") return trips.length
  if (metric === "distance") {
    return trips.reduce(
      (sum, trip) => sum + Number(trip.total_distance_meters ?? 0),
      0,
    )
  }
  if (metric === "max_speed") {
    return trips.reduce(
      (max, trip) => Math.max(max, Number(trip.max_speed_mps ?? 0)),
      0,
    )
  }

  const totalDistance = trips.reduce(
    (sum, trip) => sum + Number(trip.total_distance_meters ?? 0),
    0,
  )
  const totalDurationMs = trips.reduce((sum, trip) => {
    const started = new Date(trip.started_at).getTime()
    const ended = new Date(trip.ended_at ?? trip.started_at).getTime()
    return sum + Math.max(0, ended - started)
  }, 0)
  if (totalDurationMs > 0) {
    return totalDistance / (totalDurationMs / 1000)
  }
  return trips.length > 0
    ? trips.reduce(
        (sum, trip) => sum + Number(trip.average_speed_mps ?? 0),
        0,
      ) / trips.length
    : 0
}

const unitForMetric = (metric: Metric) => {
  if (metric === "distance") return "m"
  if (metric === "trip_count") return "trips"
  return "m/s"
}

const fetchScopedProfiles = async (
  supabase: any,
  userId: string,
  scope: Scope,
) => {
  if (scope === "friends") {
    const { data: friendships, error } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    if (error) throw error

    const ids = [
      userId,
      ...new Set(
        (friendships ?? []).map((row: Record<string, string>) =>
          row.requester_id === userId ? row.addressee_id : row.requester_id
        ),
      ),
    ]
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", ids)
      .eq("leaderboard_opt_in", true)
    if (profileError) throw profileError
    return profiles as ProfileRow[]
  }

  if (scope === "nearby") {
    const { data: profile, error: currentProfileError } = await supabase
      .from("profiles")
      .select("coarse_location_hash, nearby_opt_in")
      .eq("user_id", userId)
      .maybeSingle()
    if (currentProfileError) throw currentProfileError
    if (!profile?.nearby_opt_in || !profile?.coarse_location_hash) return []

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .eq("leaderboard_opt_in", true)
      .eq("nearby_opt_in", true)
      .eq("coarse_location_hash", profile.coarse_location_hash)
    if (error) throw error
    return profiles as ProfileRow[]
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .eq("leaderboard_opt_in", true)
    .limit(500)
  if (error) throw error
  return profiles as ProfileRow[]
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const body = await readJson<{ metric?: unknown; period?: unknown; scope?: unknown }>(req)
    const metric = validMetric(body.metric) ? body.metric : "distance"
    const period = validPeriod(body.period) ? body.period : "week"
    const scope = validScope(body.scope) ? body.scope : "friends"
    const supabase = ctx.supabaseAdmin

    const profiles = await fetchScopedProfiles(supabase, userId, scope)
    const profileIds = profiles.map((profile) => profile.user_id)
    if (profileIds.length === 0) {
      return json({ entries: [] })
    }

    let tripQuery = supabase
      .from("cloud_trips")
      .select("user_id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps")
      .in("user_id", profileIds)
      .is("deleted_at", null)
      .eq("record_status", "completed")

    const since = periodStartIso(period)
    if (since) {
      tripQuery = tripQuery.gte("started_at", since)
    }

    const { data: trips, error: tripError } = await tripQuery
    if (tripError) throw tripError

    const tripsByUserId = new Map<string, CloudTripRow[]>()
    for (const trip of (trips ?? []) as CloudTripRow[]) {
      tripsByUserId.set(trip.user_id, [
        ...(tripsByUserId.get(trip.user_id) ?? []),
        trip,
      ])
    }

    const entries = profiles
      .map((profile) => {
        const userTrips = tripsByUserId.get(profile.user_id) ?? []
        return {
          profile,
          value: valueForMetric(metric, userTrips),
          tripCount: userTrips.length,
        }
      })
      .filter((entry) => entry.tripCount > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 50)
      .map((entry, index) => ({
        rank: index + 1,
        userId: entry.profile.user_id,
        username: entry.profile.username ?? "driver",
        displayName: entry.profile.display_name ?? "Driver",
        avatarUrl: entry.profile.avatar_url ?? null,
        metric,
        period,
        scope,
        value: entry.value,
        unit: unitForMetric(metric),
      }))

    return json({ entries })
  }),
}
