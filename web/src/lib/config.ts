const requiredProductionKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
  "NEXT_PUBLIC_LEGAL_ADDRESS",
  "NEXT_PUBLIC_PRIVACY_EMAIL",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "NEXT_PUBLIC_SAFETY_EMAIL",
  "NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE",
  "NEXT_PUBLIC_TERMS_VERSION",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
] as const;

type RequiredProductionKey = (typeof requiredProductionKeys)[number];

// Keep every browser-facing value as an explicit NEXT_PUBLIC reference. Next.js
// replaces these references in the client bundle; a computed `process.env[name]`
// lookup works on the server but is not reliably available in the browser.
const publicEnvironment: Record<RequiredProductionKey, string | undefined> = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_LEGAL_ENTITY_NAME: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME,
  NEXT_PUBLIC_LEGAL_ADDRESS: process.env.NEXT_PUBLIC_LEGAL_ADDRESS,
  NEXT_PUBLIC_PRIVACY_EMAIL: process.env.NEXT_PUBLIC_PRIVACY_EMAIL,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_SAFETY_EMAIL: process.env.NEXT_PUBLIC_SAFETY_EMAIL,
  NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE: process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE,
  NEXT_PUBLIC_TERMS_VERSION: process.env.NEXT_PUBLIC_TERMS_VERSION,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
};

function value(name: RequiredProductionKey, fallback: string) {
  const configured = publicEnvironment[name]?.trim();
  if (configured) return configured;
  if (process.env.VERCEL_ENV === "production" && requiredProductionKeys.includes(name)) {
    throw new Error(`Missing required production environment variable: ${name}`);
  }
  return fallback;
}

export const appConfig = {
  siteUrl: value("NEXT_PUBLIC_SITE_URL", "http://localhost:3000"),
  legalEntityName: value("NEXT_PUBLIC_LEGAL_ENTITY_NAME", "V3l0city"),
  legalAddress: value("NEXT_PUBLIC_LEGAL_ADDRESS", "Legal address supplied before launch"),
  privacyEmail: value("NEXT_PUBLIC_PRIVACY_EMAIL", "privacy@example.com"),
  supportEmail: value("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com"),
  safetyEmail: value("NEXT_PUBLIC_SAFETY_EMAIL", "safety@example.com"),
  legalEffectiveDate: value("NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE", "July 30, 2026"),
  termsVersion: value("NEXT_PUBLIC_TERMS_VERSION", "2026-07-30"),
  turnstileSiteKey: value("NEXT_PUBLIC_TURNSTILE_SITE_KEY", ""),
  supabaseUrl: value("NEXT_PUBLIC_SUPABASE_URL", ""),
  supabasePublishableKey: value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""),
  iosAppUrl: process.env.NEXT_PUBLIC_IOS_APP_URL?.trim() || "https://example.com/v3l0city-ios",
  androidAppUrl: process.env.NEXT_PUBLIC_ANDROID_APP_URL?.trim() || "https://example.com/v3l0city-android",
};

export function isSupabaseConfigured() {
  return Boolean(appConfig.supabaseUrl && appConfig.supabasePublishableKey);
}
