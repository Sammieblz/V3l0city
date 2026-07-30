import { describe, expect, it } from "vitest";

import {
  normalizeMarketingThemePreference,
  resolveMarketingTheme,
} from "@/lib/marketing-theme";

describe("marketing theme preferences", () => {
  it("uses System when storage has no valid preference", () => {
    expect(normalizeMarketingThemePreference(undefined)).toBe("system");
    expect(normalizeMarketingThemePreference("unexpected")).toBe("system");
  });

  it("preserves supported choices", () => {
    expect(normalizeMarketingThemePreference("system")).toBe("system");
    expect(normalizeMarketingThemePreference("light")).toBe("light");
    expect(normalizeMarketingThemePreference("dark")).toBe("dark");
  });

  it("uses the browser scheme only for the System preference", () => {
    expect(resolveMarketingTheme("system", false)).toBe("light");
    expect(resolveMarketingTheme("system", true)).toBe("dark");
    expect(resolveMarketingTheme("light", true)).toBe("light");
    expect(resolveMarketingTheme("dark", false)).toBe("dark");
  });
});
