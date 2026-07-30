import { afterEach, describe, expect, it, vi } from "vitest";

const keys = [
  "VERCEL_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

const initialEnvironment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function restoreEnvironment() {
  for (const key of keys) {
    const value = initialEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
}

afterEach(restoreEnvironment);

describe("public configuration", () => {
  it("recognizes explicitly named browser Supabase values", async () => {
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";

    const { appConfig, isSupabaseConfigured } = await import("@/lib/config");

    expect(isSupabaseConfigured()).toBe(true);
    expect(appConfig.supabaseUrl).toBe("https://project.example.supabase.co");
  });

  it("fails the production build when required public values are absent", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    await expect(import("@/lib/config")).rejects.toThrow(
      "Missing required production environment variable: NEXT_PUBLIC_SITE_URL",
    );
  });
});

