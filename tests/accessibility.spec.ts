import { expect, test } from "@playwright/test";

for (const { route, target } of [
  { route: "/", target: "#content" },
  { route: "/docs", target: "#nd-page" },
  { route: "/console", target: "#console-content" },
]) {
  test(`keyboard users can skip navigation on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.goto(route);

    const skip = page.getByRole("link", { name: /^Skip to / });
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await expect(skip).toHaveCSS("outline-width", "2px");

    await page.keyboard.press("Enter");
    await expect(page.locator(target)).toBeFocused();
    await expect(page.locator(target)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
}

test("the homepage reflows with WCAG text spacing on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.addStyleTag({
    content: `
      * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      p {
        margin-bottom: 2em !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts.ready);

  await expect(page.getByRole("heading", { name: "Private AI." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
