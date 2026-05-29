import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const { userId: targetUserId } = await readJson<{ userId?: string }>(req)
    if (!targetUserId || targetUserId === userId) {
      return json({ code: "invalid_friend", message: "Invalid friend request." }, 400)
    }

    const supabase = ctx.supabaseAdmin
    const { data: existing, error: existingError } = await supabase
      .from("friendships")
      .select("*")
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${userId})`)
      .maybeSingle()
    if (existingError) throw existingError

    if (existing?.status === "pending" && existing.addressee_id === userId) {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (error) throw error
      return json({ ok: true, status: "accepted" })
    }

    if (existing) {
      return json({ ok: true, status: existing.status })
    }

    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: targetUserId,
      status: "pending",
    })
    if (error) throw error
    return json({ ok: true, status: "pending" })
  }),
}
