/** Public-page smoke uses fake identity/legal values and no live provider. */
export const publicCheckOrigin = "http://127.0.0.1:3100";

export function publicCheckEnvironment(environment = process.env) {
  const result = {
    ...environment,
    V3L0CITY_WEB_PUBLIC_CHECK: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SITE_URL: publicCheckOrigin,
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "V3l0city test fixture",
    NEXT_PUBLIC_LEGAL_ADDRESS: "Synthetic test address",
    NEXT_PUBLIC_PRIVACY_EMAIL: "privacy@example.test",
    NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.test",
    NEXT_PUBLIC_SAFETY_EMAIL: "safety@example.test",
    NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE: "October 28, 2026",
    NEXT_PUBLIC_TERMS_VERSION: "test-only",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    EXPO_PUBLIC_SUPABASE_URL: "",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    NEXT_PUBLIC_IOS_APP_URL: "https://example.com/v3l0city-ios",
    NEXT_PUBLIC_ANDROID_APP_URL: "https://example.com/v3l0city-android",
  };
  // A developer's legacy credentials must not reach the public smoke process.
  for (const key of Object.keys(result)) {
    if (key.startsWith("SUPABASE_") || key.startsWith("TURNSTILE_")) delete result[key];
  }
  return result;
}
