import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const { userId: otherUserId, action } = await readJson<{
      userId?: string
      action?: "accept" | "decline" | "cancel" | "remove" | "block"
    }>(req)
    if (!otherUserId || !action) {
      return json({ code: "invalid_response", message: "Invalid friendship response." }, 400)
    }

    const supabase = ctx.supabaseAdmin
    if (action === "decline") {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("requester_id", otherUserId)
        .eq("addressee_id", userId)
        .eq("status", "pending")
      if (error) throw error
      return json({ ok: true, status: "declined" })
    }

    if (action === "cancel") {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("requester_id", userId)
        .eq("addressee_id", otherUserId)
        .eq("status", "pending")
      if (error) throw error
      return json({ ok: true, status: "cancelled" })
    }

    if (action === "remove") {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("status", "accepted")
        .or(`and(requester_id.eq.${otherUserId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${otherUserId})`)
      if (error) throw error
      return json({ ok: true, status: "removed" })
    }

    const { data: existing, error: existingError } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(`and(requester_id.eq.${otherUserId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${otherUserId})`)
      .maybeSingle()
    if (existingError) throw existingError

    if (existing?.id) {
      if (action === "accept" && (existing.addressee_id !== userId || existing.status !== "pending")) {
        return json({ code: "not_incoming_request", message: "No incoming friend request found." }, 400)
      }
      const { error } = await supabase
        .from("friendships")
        .update({
          status: action === "block" ? "blocked" : "accepted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
      if (error) throw error
      return json({ ok: true, status: action === "block" ? "blocked" : "accepted" })
    }

    if (action === "accept") {
      return json({ code: "not_found", message: "No incoming friend request found." }, 404)
    }

    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: otherUserId,
      status: "blocked",
    })
    if (error) throw error
    return json({ ok: true, status: "blocked" })
  }),
}
