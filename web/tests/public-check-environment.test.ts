import { describe, expect, it } from "vitest";
import { publicCheckEnvironment, publicCheckOrigin } from "../scripts/public-check-environment.mjs";

describe("public production smoke isolation", () => {
  it("replaces inherited provider/site values without changing the developer environment", () => {
    const inherited = { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://do-not-contact.example.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "inherited-public-canary",
      EXPO_PUBLIC_SUPABASE_URL: "https://do-not-contact-expo.example.test",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "inherited-expo-canary",
      SUPABASE_SERVICE_ROLE_KEY: "inherited-private-canary",
      TURNSTILE_SECRET_KEY: "inherited-turnstile-canary",
      NEXT_PUBLIC_SITE_URL: "https://do-not-contact-site.example.test",
      VERCEL_ENV: "production",
    };
    const fixture = publicCheckEnvironment(inherited);
    expect(fixture.NEXT_PUBLIC_SUPABASE_URL).toBe("");
    expect(fixture.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("");
    expect(fixture.EXPO_PUBLIC_SUPABASE_URL).toBe("");
    expect(fixture.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("");
    expect(fixture).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(fixture).not.toHaveProperty("TURNSTILE_SECRET_KEY");
    expect(fixture.NEXT_PUBLIC_SITE_URL).toBe(publicCheckOrigin);
    expect(fixture.V3L0CITY_WEB_PUBLIC_CHECK).toBe("1");
    expect(inherited.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("inherited-public-canary");
  });
});
