import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

import { json, readJson, userIdFromContext } from "../_shared/http.ts"

const recentAuthenticationWindowMs = 15 * 60 * 1000

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = userIdFromContext(ctx)
    const { confirmation } = await readJson<{ confirmation?: string }>(req)
    if (confirmation !== "DELETE") {
      return json({ code: "confirmation_required", message: "Type DELETE to permanently remove this account." }, 400)
    }

    const supabase = ctx.supabaseAdmin
    const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !userResult.user) throw userError ?? new Error("Account not found.")
    const signedInAt = new Date(userResult.user.last_sign_in_at ?? 0).getTime()
    if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > recentAuthenticationWindowMs) {
      return json({ code: "recent_authentication_required", message: "Confirm your password again before deleting this account." }, 401)
    }

    // Deleting an Auth user does not itself invalidate every existing token; revoke the current
    // account session before the permanent delete. The Edge Function service key remains server-only.
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (bearer) {
      const { error: signOutError } = await supabase.auth.admin.signOut(bearer, "global")
      if (signOutError) throw signOutError
    }
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId, false)
    if (deleteError) throw deleteError
    return json({ ok: true, message: "Account permanently deleted." })
  }),
}
