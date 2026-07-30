import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { appConfig, isSupabaseConfigured } from "@/lib/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/dashboard";
  const destination = new URL(code && isSupabaseConfigured() ? next : "/auth/sign-in", url.origin);
  const response = NextResponse.redirect(destination);
  if (!code || !isSupabaseConfigured()) return response;
  const supabase = createServerClient(appConfig.supabaseUrl, appConfig.supabasePublishableKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
