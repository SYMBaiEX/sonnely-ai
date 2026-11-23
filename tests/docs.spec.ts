import { expect, test } from "@playwright/test";

test("the Platform menu exposes the enabled product pages on desktop and mobile", async ({ page }) => {
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
    expect(routes).toEqual(["/inference", "/observability", "/compute"]);

    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link", { name: /Confidential inference/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    const box = await panel.boundingBox();
    expect(box?.x).toBeGreaterThan(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await panel.getByRole("link", { name: /^Compute/ }).click();
    await expect(page).toHaveURL(/\/compute$/);
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
  const searchInput = page.getByRole("dialog").getByRole("combobox");
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveCSS("border-width", "0px");
  await expect(searchInput).toHaveCSS("outline-style", "none");
  await searchInput.fill("Confidentiality");
  await page.getByRole("option").filter({ hasText: "Confidentiality and attestation" }).first().click();
  await expect(page).toHaveURL(/\/docs\/attestation(?:#.*)?$/);
  const search = await request.get("/api/search?query=Blackboxes");
  expect(search.ok()).toBe(true);
  expect(await search.text()).not.toContain("/docs/blackboxes");

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

  for (const season of ["forest", "winter"]) {
    for (const theme of ["day", "night"]) {
      const artwork = await request.head(`/${season}-${theme}.webp`, {
        headers: { Host: "docs.sonnely.com" },
        maxRedirects: 0,
      });
      expect(artwork.ok()).toBe(true);
      expect(artwork.headers()["content-type"]).toBe("image/webp");
    }
  }
});

test("the shared docs header leads to the site and console on desktop and mobile", async ({ page }) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/docs/api");

    const header = page.getByRole("banner", { name: "Sonnely" });
    const nav = header.getByRole("navigation", { name: "Main navigation" });
    const logo = header.getByRole("link", { name: "Sonnely", exact: true });
    const theme = header.getByRole("switch", { name: "Switch color theme" });
    await expect(logo).toHaveAttribute("href", "https://sonnely.com");
    await expect(logo.locator(".brand-wordmark")).toBeVisible();
    await expect(logo.locator(".brand-wordmark")).toHaveCSS("mask-image", /sonnely-wordmark\.svg\?v=2/);
    await expect(logo.locator(".brand-icon")).toHaveCSS("background-image", /sonnely-crimson\.svg/);
    await theme.click();
    await expect(logo.locator(".brand-icon")).toHaveCSS("background-image", /sonnely-blue\.svg/);
    await theme.click();
    await expect(logo.locator(".brand-icon")).toHaveCSS("background-image", /sonnely-crimson\.svg/);
    await expect(nav.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "location");
    await nav.locator("summary").click();
    await expect(nav.getByRole("link", { name: /^Compute/ })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    await header.getByRole("link", { name: "Open console" }).click();
    await expect(page).toHaveURL(/\/console$/);
    const toggle = page.getByRole("button", { name: "Toggle navigation" });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("link", { name: "Documentation", exact: true }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(header).toBeVisible();
  }
});

test("the docs overview groups its guide links and fits a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/docs");
  await expect(page.getByRole("main").getByRole("link", { name: /Send your first request/ })).toHaveAttribute(
    "href",
    "/docs/quickstart",
  );
  const guides = page.getByRole("navigation", { name: "Browse guides" });
  await expect(guides.getByRole("heading", { level: 3 })).toHaveText([
    "Get started",
    "Inference",
    "Confidentiality and compute",
    "Operations and support",
  ]);
  await expect(guides.getByRole("link")).toHaveCount(17);
  await expect(guides.getByRole("link", { name: "Request limits" })).toHaveAttribute(
    "href",
    "/docs/api#request-limits",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await guides.getByRole("link", { name: "SDKs", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/sdks$/);
});

test("the API reference links endpoints and copies the canonical base URL", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/docs/api");
  const endpoints = page.getByRole("navigation", { name: "API endpoints" });
  await expect(endpoints.getByRole("link", { name: /GET \/models/ })).toHaveAttribute("href", "#list-models");
  await page.getByRole("button", { name: "Copy base URL" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://sonnely.com/api/sonnely/v1");
  await endpoints.getByRole("link", { name: /POST \/chat\/completions/ }).click();
  await expect(page).toHaveURL(/#create-a-completion$/);
  await expect(page.getByRole("heading", { name: "Create a completion" })).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "SONNELY_API_KEY" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("the docs sidebar groups pages and adopts the Sonnely palette in both themes", async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date("2026-12-01T12:00:00Z"));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/streaming");
  const sidebar = page.getByRole("complementary", { name: "Documentation sidebar" });
  await expect(sidebar.locator(".docs-sidebar-section")).toHaveText(["Get started", "Inference", "Support"]);
  const currentLink = sidebar.getByRole("link", { name: "Streaming and usage" });
  await expect(currentLink).toHaveAttribute("aria-current", "page");
  await expect(currentLink).toHaveCSS("box-shadow", "none");
  const shell = page.locator(".docs-shell");
  const forest = shell.locator(".console-world");
  const visualizer = shell.locator(".ambient-visualizer");
  const motion = sidebar.getByRole("switch", { name: "Ambient motion" });
  const header = page.getByRole("banner", { name: "Sonnely" });
  await expect(shell).toHaveCSS("background-color", "rgb(12, 11, 14)");
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(sidebar).toHaveCSS("background-color", "rgb(12, 11, 14)");
  await expect(forest).toHaveCSS("position", "fixed");
  await expect(forest).toHaveCSS("top", "0px");
  await expect(forest).toHaveCSS("background-image", /winter-night\.webp/);
  await expect(forest).toHaveCSS("animation-name", "workspace-scene-in");
  await expect(visualizer).toBeVisible();
  const switcher = header.getByRole("switch", { name: "Switch color theme" });
  await switcher.click();
  await expect(shell).toHaveCSS("background-color", "rgb(238, 240, 250)");
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(sidebar).toHaveCSS("background-color", "rgb(238, 240, 250)");
  await expect(forest).toHaveCSS("background-image", /winter-day\.webp/);
  await motion.click();
  await expect(forest).toHaveCSS("animation-name", "none");
  await expect(visualizer).toBeHidden();
  await page.reload();
  await expect(switcher).toHaveAttribute("aria-checked", "true");
  await expect(motion).toHaveAttribute("aria-checked", "false");
  await motion.click();
  await expect(visualizer).toBeVisible();

  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("# Streaming and usage");
  await expect(page.getByRole("link", { name: "View Markdown" })).toHaveAttribute(
    "href",
    "/docs/streaming.md",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("#nd-subnav")).toHaveCSS("background-color", "rgb(238, 240, 250)");
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(forest).toHaveCSS("animation-name", "none");
  await expect(visualizer).toBeHidden();
});

test("quickstart and streaming keep commands copyable and preserve guide anchors", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/docs/quickstart#send-a-completion");
  await expect(page.getByRole("heading", { name: "Send a completion" })).toHaveAttribute(
    "id",
    "send-a-completion",
  );
  await expect(page.locator(".fd-step")).toHaveCount(4);
  const markdown = await request.get("/docs/quickstart.md");
  const source = await markdown.text();
  expect(source).toContain("## Send a completion [#send-a-completion]");
  expect(source).not.toMatch(/<\/?(?:s|i|Step|Steps)\b/);
  const completion = page.locator("figure").filter({ hasText: "Send a text completion" });
  await completion.getByRole("button", { name: "Copy Text" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("https://sonnely.com/api/sonnely/v1/chat/completions");
  await page
    .getByRole("navigation", { name: "Continue the quickstart" })
    .getByRole("link", { name: "Stream a response" })
    .click();
  await expect(page).toHaveURL(/\/docs\/streaming$/);
  await expect(page.getByRole("heading", { name: "Read the events" })).toHaveAttribute(
    "id",
    "read-the-events",
  );
  const stream = page.locator("figure").filter({ hasText: "Stream a text completion" });
  await stream.getByRole("button", { name: "Copy Text" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('"stream_options": {"include_usage": true}');
  await expect(page.locator(".docs-event-sequence li")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("SDK example tabs support keyboard selection and export both variants", async ({ page, request }) => {
  await page.goto("/docs/sdks");
  const typescript = page.getByRole("tablist").first();
  const completion = typescript.getByRole("tab", { name: "Completion" });
  const streaming = typescript.getByRole("tab", { name: "Streaming" });
  await expect(completion).toHaveAttribute("aria-selected", "true");
  await completion.focus();
  await page.keyboard.press("ArrowRight");
  await expect(streaming).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(streaming).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").filter({ hasText: "stream.mjs" })).toContainText("sonnely.stream");
  await expect(page.getByRole("tabpanel").filter({ hasText: "complete.py" })).toContainText(
    "sonnely.complete",
  );

  const markdown = await request.get("/docs/sdks.md");
  const source = await markdown.text();
  expect(source).toContain("sonnely.complete");
  expect(source).toContain("sonnely.stream");
  expect(source).toContain("from openai import OpenAI");
  expect(source).not.toMatch(/<\/?Tabs?\b/);
});
