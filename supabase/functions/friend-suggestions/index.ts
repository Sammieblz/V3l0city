import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, userIdFromContext } from "../_shared/http.ts"
import { toFriendProfile, type FriendshipRow, type ProfileRow } from "../_shared/social.ts"

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
    const friendIds = rows
      .filter((row) => row.status === "accepted")
      .map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id)

    if (friendIds.length === 0) {
      return json({ users: [] })
    }

    const { data: secondDegreeRows, error: secondDegreeError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.in.(${friendIds.join(",")}),addressee_id.in.(${friendIds.join(",")})`)
    if (secondDegreeError) throw secondDegreeError

    const candidateIds = new Set<string>()
    for (const row of (secondDegreeRows ?? []) as FriendshipRow[]) {
      if (row.requester_id !== userId && !friendIds.includes(row.requester_id)) {
        candidateIds.add(row.requester_id)
      }
      if (row.addressee_id !== userId && !friendIds.includes(row.addressee_id)) {
        candidateIds.add(row.addressee_id)
      }
    }

    if (candidateIds.size === 0) {
      return json({ users: [] })
    }

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", [...candidateIds])
      .limit(25)
    if (error) throw error

    return json({
      users: (profiles ?? []).map((profile: ProfileRow) =>
        toFriendProfile(userId, profile, rows)
      ),
    })
  }),
}
