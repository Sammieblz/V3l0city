import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"
import { toFriendProfile, type FriendshipRow, type ProfileRow } from "../_shared/social.ts"

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const { coarseLocationHash } = await readJson<{ coarseLocationHash?: string }>(req)
    const hash = coarseLocationHash?.trim().toLowerCase()
    if (!hash || hash.length < 4) {
      return json({ users: [] })
    }

    const supabase = ctx.supabaseAdmin
    await supabase
      .from("profiles")
      .update({
        coarse_location_hash: hash,
        nearby_opt_in: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, coarse_location_hash")
      .eq("nearby_opt_in", true)
      .eq("coarse_location_hash", hash)
      .neq("user_id", userId)
      .limit(25)
    if (error) throw error

    const { data: friendships, error: friendshipError } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    if (friendshipError) throw friendshipError

    return json({
      users: (profiles ?? []).map((profile: ProfileRow) =>
        toFriendProfile(userId, profile, friendships as FriendshipRow[], "nearby")
      ),
    })
  }),
}
