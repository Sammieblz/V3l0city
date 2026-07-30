export const MARKETING_THEME_STORAGE_KEY = "v3l0city-marketing-theme";

export type MarketingThemePreference = "system" | "light" | "dark";
export type ResolvedMarketingTheme = Exclude<MarketingThemePreference, "system">;

export function normalizeMarketingThemePreference(value: unknown): MarketingThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveMarketingTheme(
  preference: MarketingThemePreference,
  prefersDark: boolean,
): ResolvedMarketingTheme {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

/**
 * This tiny, dependency-free snippet runs before React hydrates. It reads only
 * the visual preference stored by this site and lets the CSS render the right
 * marketing palette on the very first paint.
 */
export const marketingThemeBootstrapScript = `
(() => {
  try {
    const key = ${JSON.stringify(MARKETING_THEME_STORAGE_KEY)};
    const stored = window.localStorage.getItem(key);
    const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const resolved = preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : preference === "system" ? "light" : preference;
    document.documentElement.dataset.marketingThemePreference = preference;
    document.documentElement.dataset.marketingTheme = resolved;
  } catch {
    document.documentElement.dataset.marketingThemePreference = "system";
    document.documentElement.dataset.marketingTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
})();
`;
