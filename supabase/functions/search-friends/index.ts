import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"
import { toFriendProfile, type FriendshipRow, type ProfileRow } from "../_shared/social.ts"

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const { query } = await readJson<{ query?: string }>(req)
    const q = (query?.trim().toLowerCase() ?? "").replace(/[%,]/g, "")
    if (q.length < 2) {
      return json({ users: [] })
    }

    const supabase = ctx.supabaseAdmin
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .neq("user_id", userId)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(25)
    if (error) throw error

    const ids = (profiles ?? []).map((profile: ProfileRow) => profile.user_id)
    const { data: friendships, error: friendshipError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    if (friendshipError) throw friendshipError

    const visibleFriendships = (friendships ?? []).filter((friendship: FriendshipRow) =>
      ids.includes(friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id)
    )

    return json({
      users: (profiles ?? []).map((profile: ProfileRow) =>
        toFriendProfile(userId, profile, visibleFriendships)
      ),
    })
  }),
}
