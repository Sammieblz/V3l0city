import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, userIdFromContext } from "../_shared/http.ts"
import {
  buildFriendStats,
  buildFriendStatsByUser,
  toFriendProfile,
  type FriendshipRow,
  type ProfileRow,
  type TripAggregateRow,
} from "../_shared/social.ts"

const profileSelect =
  "user_id, username, display_name, avatar_url, coarse_location_hash"

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    const userId = userIdFromContext(ctx)
    const supabase = ctx.supabaseAdmin

    const { data: friendships, error: friendshipError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    if (friendshipError) throw friendshipError

    const rows = (friendships ?? []) as FriendshipRow[]
    const targetIds = [
      ...new Set(
        rows.map((row) =>
          row.requester_id === userId ? row.addressee_id : row.requester_id
        ),
      ),
    ]

    if (targetIds.length === 0) {
      return json({ incoming: [], outgoing: [], friends: [] })
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select(profileSelect)
      .in("user_id", targetIds)
    if (profileError) throw profileError

    const profileById = new Map<string, ProfileRow>(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [
        profile.user_id,
        profile,
      ]),
    )
    const friendIds = rows
      .filter((row) => row.status === "accepted")
      .map((row) =>
        row.requester_id === userId ? row.addressee_id : row.requester_id
      )

    const statsByUserId = new Map<string, ReturnType<typeof buildFriendStats>>()
    if (friendIds.length > 0) {
      const { data: trips, error: tripError } = await supabase
        .from("cloud_trips")
        .select(
          "user_id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps",
        )
        .in("user_id", friendIds)
        .is("deleted_at", null)
        .eq("record_status", "completed")
      if (tripError) throw tripError

      const grouped = buildFriendStatsByUser((trips ?? []) as TripAggregateRow[])
      for (const friendId of friendIds) {
        statsByUserId.set(friendId, buildFriendStats(grouped.get(friendId) ?? []))
      }
    }

    const toResponseProfile = (row: FriendshipRow) => {
      const otherUserId =
        row.requester_id === userId ? row.addressee_id : row.requester_id
      const profile = profileById.get(otherUserId)
      if (!profile) return null
      const base = toFriendProfile(userId, profile, rows)
      return {
        ...base,
        statsPreview:
          row.status === "accepted"
            ? statsByUserId.get(otherUserId) ?? buildFriendStats([])
            : null,
      }
    }

    return json({
      incoming: rows
        .filter((row) => row.status === "pending" && row.addressee_id === userId)
        .map(toResponseProfile)
        .filter(Boolean),
      outgoing: rows
        .filter((row) => row.status === "pending" && row.requester_id === userId)
        .map(toResponseProfile)
        .filter(Boolean),
      friends: rows
        .filter((row) => row.status === "accepted")
        .map(toResponseProfile)
        .filter(Boolean),
    })
  }),
}
