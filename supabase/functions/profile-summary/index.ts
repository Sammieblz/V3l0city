import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"
import {
  buildFriendStats,
  relationshipFor,
  toFriendProfile,
  type FriendshipRow,
  type ProfileRow,
  type TripAggregateRow,
} from "../_shared/social.ts"

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const { userId: requestedUserId } = await readJson<{ userId?: string }>(req)
    const targetUserId = requestedUserId?.trim() || userId
    const supabase = ctx.supabaseAdmin

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, coarse_location_hash")
      .eq("user_id", targetUserId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) {
      return json({ code: "profile_not_found", message: "Profile not found." }, 404)
    }

    const isSelf = targetUserId === userId
    let friendships: FriendshipRow[] = []
    if (!isSelf) {
      const { data, error } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`)
      if (error) throw error
      friendships = (data ?? []) as FriendshipRow[]
    }

    const relationship = isSelf
      ? "friends"
      : relationshipFor(userId, targetUserId, friendships)
    const statsVisible = isSelf || relationship === "friends"
    let stats = null

    if (statsVisible) {
      const { data: trips, error: tripError } = await supabase
        .from("cloud_trips")
        .select(
          "user_id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps",
        )
        .eq("user_id", targetUserId)
        .is("deleted_at", null)
        .eq("record_status", "completed")
      if (tripError) throw tripError
      stats = buildFriendStats((trips ?? []) as TripAggregateRow[])
    }

    const base = toFriendProfile(
      userId,
      profile as ProfileRow,
      isSelf ? [] : friendships,
    )

    return json({
      user: {
        ...base,
        relationship,
        isSelf,
        statsVisible,
        stats,
      },
    })
  }),
}
