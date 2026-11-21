import { expect, test } from "@playwright/test";

test("the theme follows the user across the site and all console pages", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2027-01-02T12:00:00Z"));
  await page.goto("/");
  const site = page.locator(".theme-root");
  const switcher = page.getByRole("button", { name: "Switch color theme" });
  await expect(site).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".hero .scene-image")).toHaveCSS("background-image", /forest-night\.webp/);

  await switcher.click();
  await expect(site).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".hero .scene-image")).toHaveCSS("background-image", /forest-day\.webp/);
  for (const route of ["", "/models", "/keys", "/usage", "/billing", "/referrals", "/settings"]) {
    await page.goto("/console" + route);
    await expect(site).toHaveAttribute("data-theme", "light");
    const current = page
      .getByRole("navigation", { name: "Workspace navigation" })
      .locator("[aria-current='page']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveCSS("box-shadow", "none");
  }
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await page.goto("/");
  await expect(site).toHaveAttribute("data-theme", "dark");
});

test("the forest layers move on scroll and honor reduced motion", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator(".scene-hero");
  const artwork = scene.locator(".scene-image");
  await page.evaluate(() => window.scrollTo(0, 320));
  await expect
    .poll(async () => artwork.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))
    .toBeGreaterThan(2);
  await expect
    .poll(async () =>
      scene
        .locator(".scene-mist")
        .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42),
    )
    .toBeGreaterThan(7);
  await page.getByRole("button", { name: "Next model" }).click();
  await expect.poll(() => page.locator("#model-strip").evaluate((el) => el.scrollLeft)).toBeGreaterThan(30);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(artwork).toHaveCSS("transform", "none");
  await expect(scene.locator(".scene-embers")).toBeHidden();
});

test("winter artwork switches across the site and the console at Chicago midnight", async ({ page }) => {
  await page.clock.install({ time: new Date("2027-01-01T05:58:00Z") });
  await page.goto("/");
  const art = page.locator(".hero .scene-image");
  const feature = page.locator(".request-scene .scene-image");
  await expect(art).toHaveCSS("background-image", /winter-night\.webp/);
  await expect(feature).toHaveCSS("background-image", /winter-sanctuary-night\.webp/);
  await page.getByRole("button", { name: "Switch color theme" }).click();
  await expect(art).toHaveCSS("background-image", /winter-day\.webp/);
  await expect(feature).toHaveCSS("background-image", /winter-sanctuary-day\.webp/);
  await page.clock.fastForward(120_000);
  await expect(art).toHaveCSS("background-image", /forest-day\.webp/);
  await expect(feature).toHaveCSS("background-image", /sanctuary-day\.webp/);
  await page.goto("/console");
  await expect(page.locator(".console-world")).toHaveCSS("background-image", /forest-day\.webp/);
});

test("request stages, catalog ordering and keyboard navigation work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "NEAR AI enclave" }).click();
  await expect(page.getByRole("link", { name: "Attestation guide" })).toBeVisible();
  await page.goto("/models");
  await page.getByRole("combobox", { name: "Sort models" }).selectOption("input");
  await expect(page.locator(".catalog-cards h3").first()).toHaveText("GLM 5.3 Flash");
  await page.goto("/console");
  await page.getByRole("button", { name: "Quick navigation" }).click();
  await page.getByRole("searchbox", { name: "Find a workspace page" }).fill("usage");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Usage", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/console\/usage$/);
});
