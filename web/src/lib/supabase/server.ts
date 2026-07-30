import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { appConfig, isSupabaseConfigured } from "@/lib/config";

export async function createClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(appConfig.supabaseUrl, appConfig.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components cannot write cookies. src/proxy.ts refreshes them.
      },
    },
  });
}
