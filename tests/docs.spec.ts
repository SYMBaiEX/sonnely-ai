import { expect, test } from "@playwright/test";

test("the Platform menu exposes all product pages on desktop and mobile", async ({ page }) => {
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const trigger = nav.locator("summary");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const panel = nav.getByRole("list", { name: "Platform pages" });
    const routes = await panel
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(routes).toEqual(["/inference", "/observability", "/compute", "/blackboxes", "/dry-docks"]);

    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link", { name: /Confidential inference/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    const box = await panel.boundingBox();
    expect(box?.x).toBeGreaterThan(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await panel.getByRole("link", { name: /Blackboxes/ }).click();
    await expect(page).toHaveURL(/\/blackboxes$/);
    await expect(panel).toBeHidden();
  }
});

test("Fumadocs serves search, SDK downloads, and compatibility links", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/sdks");
  await expect(page.getByRole("heading", { name: "SDKs", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByText("npm install @sonnely/sdk", { exact: true })).toBeVisible();
  await expect(page.getByText("python -m pip install sonnely-sdk", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Search", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").fill("Blackboxes");
  await page.getByRole("option").filter({ hasText: "Blackboxes" }).first().click();
  await expect(page).toHaveURL(/\/docs\/blackboxes$/);
  await expect(page.getByRole("link", { name: "Console → Blackboxes" })).toHaveAttribute(
    "href",
    "https://sonnely.com/console/blackboxes",
  );
  const search = await request.get("/api/search?query=Blackboxes");
  expect(search.ok()).toBe(true);
  expect(await search.text()).toContain("/docs/blackboxes");

  for (const archive of ["sonnely-typescript-0.1.2.tgz", "sonnely_sdk-0.1.2-py3-none-any.whl"]) {
    const asset = await request.get("/sdk/" + archive);
    expect(asset.ok()).toBe(true);
    expect((await asset.body()).length).toBeGreaterThan(1000);
  }
  const markdown = await request.get("/docs/api.md");
  expect(markdown.headers()["content-type"]).toMatch(/^text\/markdown/);
  expect(await markdown.text()).toContain("OpenAPI 3.1");
  const legacy = await request.get("/docs/api-reference", { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(legacy.headers().location).toBe("/docs/api");
});

test("the docs sidebar groups pages and adopts the Sonnely palette in both themes", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => localStorage.setItem("sonnely.theme", "dark"));
  await page.goto("/docs/streaming");
  const sidebar = page.getByRole("complementary", { name: "Documentation sidebar" });
  await expect(sidebar.locator(".docs-sidebar-section")).toHaveText([
    "Get started",
    "Inference",
    "Compute",
    "Support",
  ]);
  await expect(sidebar.getByRole("link", { name: "Streaming and usage" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const shell = page.locator(".docs-shell");
  await expect(shell).toHaveCSS("background-color", "rgb(12, 11, 14)");
  await expect(sidebar).toHaveCSS("background-color", "rgb(25, 23, 28)");
  await sidebar.getByRole("switch", { name: "Switch color theme" }).click();
  await expect(shell).toHaveCSS("background-color", "rgb(238, 240, 250)");
  await expect(sidebar).toHaveCSS("background-color", "rgb(249, 250, 255)");

  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("# Streaming and usage");
  await expect(page.getByRole("link", { name: "View Markdown" })).toHaveAttribute(
    "href",
    "/docs/streaming.md",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open Sidebar" }).click();
  const mobile = page
    .getByRole("complementary")
    .filter({ has: page.getByRole("link", { name: "Quickstart" }) });
  await expect(mobile.getByRole("link", { name: "Streaming and usage" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await mobile.getByRole("link", { name: "Quickstart" }).click();
  await expect(page).toHaveURL(/\/docs\/quickstart$/);
  await expect(mobile).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
