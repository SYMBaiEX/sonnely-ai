import { expect, test } from "@playwright/test";
import { models } from "../lib/models";

test("the theme follows the user across the site and all console pages", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2027-01-02T12:00:00Z"));
  await page.goto("/");
  const site = page.locator(".theme-root");
  const switcher = page.getByRole("switch", { name: "Switch color theme" });
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
  await page.getByRole("switch", { name: "Switch color theme" }).click();
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
  await expect(
    page.getByRole("table", { name: "Model rates and provider context" }).getByRole("heading").first(),
  ).toHaveText("Qwen 3.8 27B");
  await page.goto("/console");
  await page.getByRole("button", { name: "Quick navigation" }).click();
  await page.getByRole("searchbox", { name: "Find a workspace page" }).fill("usage");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Usage", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/console\/usage$/);
});

test("the homepage examples show different workflows and real playground links", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("region", { name: "Sample request preview" });
  await expect(demo.getByText("Turn these handoff notes into a brief.")).toBeVisible();
  await demo.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(demo.getByText('{ "owner": "Rin", "due": "Friday" }')).toBeVisible();
  await expect(demo.getByRole("link", { name: "Open GLM 5.3 Flash in playground" })).toHaveAttribute(
    "href",
    "/console?model=z-ai%2Fglm-5.3-flash",
  );
  const catalog = page.getByRole("region", { name: "Choose your model." });
  const list = catalog.getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(models.length);
  await expect(list.getByRole("link", { name: /DeepSeek V4.1 Flash/ })).toHaveAttribute(
    "href",
    "/console?model=deepseek-ai%2FDeepSeek-V4.1-Flash-1017",
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(list.getByRole("link", { name: /Qwen 3.6 35B/ })).toBeVisible();
  expect(await list.evaluate((element) => element.scrollWidth)).toBe(
    await list.evaluate((element) => element.clientWidth),
  );
  const previews = page.getByRole("region", { name: "Keys, usage, and credits." });
  await expect(previews.locator("figure")).toHaveCount(3);
  await previews.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      previews
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
});

test("journal filtering, contact topics and mobile navigation remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/blog");
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await expect(page.getByRole("link", { name: /How wallet funding works/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search the journal" }).fill("unmatched search");
  await expect(page.getByRole("status")).toContainText("No articles match");
  await page.goto("/contact");
  await page.getByRole("button", { name: /Billing USDC/ }).click();
  await expect(page.getByRole("combobox", { name: "Topic" })).toHaveValue("Billing");
  await page.goto("/models");
  await expect(page.getByRole("table").getByText("$0.0066", { exact: true })).toBeVisible();
  for (const path of ["/", "/docs", "/blog", "/contact", "/console/admin"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});
