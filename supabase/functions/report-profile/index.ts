import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"

const validReasons = new Set(["harassment", "impersonation", "unsafe_driving", "other"])
const reportsPerDay = 5

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const reporterId = userIdFromContext(ctx)
    const { targetUserId, reason } = await readJson<{ targetUserId?: string; reason?: string }>(req)
    if (!targetUserId || targetUserId === reporterId || !reason || !validReasons.has(reason)) {
      return json({ code: "invalid_report", message: "Choose a valid profile and report reason." }, 400)
    }

    const supabase = ctx.supabaseAdmin
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", targetUserId)
      .maybeSingle()
    if (targetError) throw targetError
    if (!target) return json({ code: "profile_not_found", message: "That profile is no longer available." }, 404)

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await supabase
      .from("user_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", reporterId)
      .gte("created_at", since)
    if (countError) throw countError
    if ((count ?? 0) >= reportsPerDay) {
      return json({ code: "report_limit", message: "You have reached the daily report limit. Try again tomorrow." }, 429)
    }

    const { error: insertError } = await supabase.from("user_reports").insert({
      reporter_id: reporterId,
      target_user_id: targetUserId,
      reason,
    })
    if (insertError) throw insertError
    return json({ ok: true, message: "Report received." })
  }),
}
