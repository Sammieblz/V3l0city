import { expect, test, type Page } from "@playwright/test";

async function openAppearanceChooser(page: Page) {
  const chooser = page.getByRole("button", { name: "Choose color theme" });
  if (!await chooser.isVisible()) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("button", { name: "Choose color theme" }).click();
}

test("landing page renders its primary message and safety boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /keep the road/i })).toBeVisible();
  await expect(page.getByText(/foreground-only/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /explore the live demo/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /download v3l0city for iphone and ipad/i })).toHaveAttribute("href", "https://example.com/v3l0city-ios");
  await expect(page.getByRole("link", { name: /download v3l0city for android/i })).toHaveAttribute("href", "https://example.com/v3l0city-android");
  const nativeDial = page.locator(".hero-native-dashboard .speedometer");
  await expect(nativeDial.locator(".speedometer-center")).toContainText("47");
  await expect(nativeDial.locator("svg line")).toHaveCount(17);
  await expect(page.locator(".instrument-card")).toHaveCount(0);
});

test("mobile navigation is keyboard-operable and preserves clear page semantics", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menuButton = page.locator(".mobile-nav-trigger");
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Product demo" }).last()).toBeVisible();

  const mobileActions = page.locator(".mobile-nav-actions .button");
  await expect(mobileActions).toHaveCount(2);
  await expect(mobileActions.first()).toHaveCSS("display", "flex");
  await expect(mobileActions.first()).toHaveCSS("justify-content", "center");
  await expect(mobileActions.first()).toHaveCSS("text-align", "center");

  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
});

test("public pages expose distinct metadata and structured FAQ content", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Drive data, in focus/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /localhost:3000$/);
  await expect.poll(() => page.locator('script[type="application/ld+json"]').evaluate((node) => node.textContent)).toContain("FAQPage");

  await page.goto("/how-it-works");
  await expect(page).toHaveTitle("How it works | V3l0city");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/how-it-works$/);
});

test("landing appearance preference persists to the simulator and System follows the browser", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("v3l0city-marketing-theme")) {
      localStorage.setItem("v3l0city-marketing-theme", "system");
    }
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-marketing-theme", "dark");

  await openAppearanceChooser(page);
  await page.getByRole("menuitemradio", { name: /light/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-marketing-theme", "light");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("v3l0city-marketing-theme"))).toBe("light");

  await page.goto("/demo");
  await expect(page.locator("html")).toHaveAttribute("data-marketing-theme", "light");
  await expect(page.getByRole("button", { name: "Choose color theme" })).toHaveCount(0);

  await page.goto("/how-it-works");
  await expect(page.locator("html")).toHaveAttribute("data-marketing-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 249, 250)");

  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-marketing-theme", "light");
  await expect(page.locator(".auth-page")).toHaveCSS("background-color", "rgb(245, 249, 250)");
  await expect(page.locator(".auth-panel .brand-mark")).toHaveAttribute("src", /brand-mark\.png/);
  await expect(page.locator(".brand-auth-mark")).toHaveCount(0);
  await expect(page.locator(".auth-identity")).toHaveCSS("display", "grid");
  await expect(page.locator(".auth-identity .eyebrow")).toHaveCSS("margin-bottom", "0px");

  await page.goto("/");
  await openAppearanceChooser(page);
  await page.getByRole("menuitemradio", { name: /system/i }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-marketing-theme", "light");
});

test("demo does not request location and clearly labels its limitations", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText(/no account. no location/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /start simulation/i })).toBeVisible();
  await expect(page.getByText(/open, visible, and unlocked/i).first()).toBeVisible();
});
