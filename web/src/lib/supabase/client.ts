import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { appConfig, isSupabaseConfigured } from "@/lib/config";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (!isSupabaseConfigured()) return null;
  browserClient ??= createBrowserClient(appConfig.supabaseUrl, appConfig.supabasePublishableKey);
  return browserClient;
}
