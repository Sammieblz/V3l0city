import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// The native app keeps its development credentials in the repository root.
// This is intentionally a one-way, local-development compatibility bridge: only
// the Supabase URL and publishable key are exposed to the browser, never a
// service-role credential. Vercel continues to use its own NEXT_PUBLIC_* envs.
loadEnvConfig(resolve(process.cwd(), ".."));

function applyExpoPublicFallback(nextName: string, expoName: string) {
  if (process.env[nextName]?.trim()) return;

  const fallback = process.env[expoName]?.trim();
  if (fallback) process.env[nextName] = fallback;
}

applyExpoPublicFallback("NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL");
applyExpoPublicFallback(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "https://*.supabase.co";
const developmentEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${developmentEval} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
      `connect-src 'self' ${supabaseOrigin} https://vitals.vercel-insights.com`,
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1"],
  // These values are deliberately public Supabase browser credentials. Defining
  // them here makes the root Expo fallback available to client-side modules at
  // build time without broadening what this project exposes.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
