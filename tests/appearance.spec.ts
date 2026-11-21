import { expect, test } from "@playwright/test";

test("the theme follows the user across the site and all console pages", async ({ page }) => {
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
