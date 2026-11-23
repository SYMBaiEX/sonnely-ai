import { expect, test } from "@playwright/test";
import { models } from "../lib/models";
import { apiBasePath, apiOrigin } from "../lib/api-contract";

test("the theme follows the user across the site and all console pages", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2027-01-02T12:00:00Z"));
  await page.goto("/");
  const site = page.locator(".theme-root");
  const backdrop = page.locator(".workspace-scene");
  const switcher = page.getByRole("switch", { name: "Switch color theme" });
  await expect(site).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".hero .scene-image")).toHaveCSS("background-image", /signal-night\.webp/);
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("background-image", /forest-night\.webp/);
  await expect(backdrop).toHaveCSS("animation-name", "workspace-scene-in");

  const thumb = switcher.locator(".theme-switch-thumb");
  await expect(thumb).toHaveCSS("transform", "none");
  await expect(switcher.locator(".theme-switch-moon")).toHaveCSS("color", "rgb(255, 232, 241)");
  await switcher.focus();
  await page.keyboard.press("Space");
  await expect(site).toHaveAttribute("data-theme", "light");
  await expect(switcher).toHaveAttribute("aria-checked", "true");
  await expect(thumb).toHaveCSS("transform", /^matrix/);
  await expect(switcher.locator(".theme-switch-sun")).toHaveCSS("color", "rgb(36, 66, 194)");
  await expect(page.locator(".hero .scene-image")).toHaveCSS("background-image", /signal-day\.webp/);
  await expect(backdrop).toHaveCSS("background-image", /forest-day\.webp/);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Models" })
    .click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(backdrop).toHaveCSS("background-image", /forest-day\.webp/);
  await expect(backdrop).toHaveCSS("position", "fixed");
  for (const route of [
    "",
    "/models",
    "/keys",
    "/usage",
    "/blackboxes",
    "/dry-docks",
    "/billing",
    "/referrals",
    "/settings",
  ]) {
    await page.goto("/console" + route);
    await expect(site).toHaveAttribute("data-theme", "light");
    await expect(backdrop).toHaveCSS("background-image", /forest-day\.webp/);
    const current = page
      .getByRole("navigation", { name: "Workspace navigation" })
      .locator("[aria-current='page']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveCSS("box-shadow", "none");
    await expect(page.locator("#console-navigation")).toHaveCSS("border-radius", "0px");
  }
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await page.goto("/");
  await expect(site).toHaveAttribute("data-theme", "dark");
});

test("the forest layers respond to scroll, pointer movement, and motion preferences", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator(".scene-hero");
  const artwork = scene.locator(".scene-image");
  const stage = page.locator(".request-stage");
  await stage.hover({ position: { x: 70, y: 90 } });
  const horizontal = await artwork.evaluate(async (el) => {
    await new Promise(requestAnimationFrame);
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
  });
  expect(horizontal).toBe(0);
  await stage.evaluate((el) => {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + 120, behavior: "instant" });
  });
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
  const closing = page.locator(".closing .scene-image");
  await expect(art).toHaveCSS("background-image", /signal-night-winter\.webp/);
  await expect(closing).toHaveCSS("background-image", /signal-night-winter\.webp/);
  await page.getByRole("switch", { name: "Switch color theme" }).click();
  await expect(art).toHaveCSS("background-image", /signal-day-winter\.webp/);
  await expect(closing).toHaveCSS("background-image", /signal-day-winter\.webp/);
  await page.clock.fastForward(120_000);
  await expect(art).toHaveCSS("background-image", /signal-day\.webp/);
  await expect(closing).toHaveCSS("background-image", /signal-day\.webp/);
  await page.goto("/console");
  await expect(page.locator(".workspace-scene")).toHaveCSS("background-image", /forest-day\.webp/);
  await expect(page.locator(".workspace-scene")).toHaveCSS("opacity", "0.46");
  await expect(page.locator(".ambient-visualizer")).toHaveCSS("opacity", "0.42");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".chat-layout")).toHaveCSS("background-color", /\/ 0\.36\)$/);
  await expect(page.locator(".console-bar")).toHaveCSS("background-color", /\/ 0\.78\)$/);
  await page.emulateMedia({ contrast: "more" });
  await expect(page.locator(".workspace-scene")).toBeHidden();
  await expect(page.locator(".chat-layout")).toHaveCSS("background-color", "rgb(238, 240, 250)");
});

test("request stages, catalog ordering and keyboard navigation work", async ({ page }) => {
  await page.goto("/");
  const station = page.getByRole("button", { name: "NEAR AI enclave" });
  await station.focus();
  await page.keyboard.press("Enter");
  await expect(station).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#request-path-detail")).toContainText("hardware-isolated environment");
  await expect(page.getByRole("link", { name: "Attestation guide" })).toBeVisible();
  await page.goto("/models");
  await page.getByRole("combobox", { name: "Sort models" }).selectOption("input");
  await expect(
    page.getByRole("table", { name: "Model rates and provider context" }).getByRole("heading").first(),
  ).toHaveText("Qwen 3.8 27B");
  await page.goto("/console");
  await page.getByRole("button", { name: "Quick navigation" }).click();
  const commandInput = page.getByRole("searchbox", { name: "Find a workspace page" });
  await expect(commandInput).toBeFocused();
  await expect(commandInput).toHaveCSS("border-width", "0px");
  await expect(commandInput).toHaveCSS("outline-style", "none");
  await commandInput.fill("usage");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Usage", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/console\/usage$/);
});

test("the request trace loops automatically and can be paused at any stop", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const map = page.getByRole("region", { name: "Follow the request" });
  const gateway = map.getByRole("button", { name: "Sonnely gateway" });
  const enclave = map.getByRole("button", { name: "NEAR AI enclave" });
  const pause = map.getByRole("button", { name: "Pause trace" });
  const resume = map.getByRole("button", { name: "Resume trace" });

  await expect(pause).toBeVisible();
  await page.clock.runFor(120);
  await expect(map.getByText("Step 1 of 3")).toBeVisible();
  await page.clock.fastForward(3600);
  await expect(gateway).toHaveAttribute("aria-pressed", "true");
  await pause.click();
  await page.clock.fastForward(10_800);
  await expect(gateway).toHaveAttribute("aria-pressed", "true");

  await resume.click();
  await page.clock.runFor(120);
  await page.clock.fastForward(3600);
  await expect(enclave).toHaveAttribute("aria-pressed", "true");
  await expect(map.getByRole("link", { name: "Attestation guide" })).toHaveAttribute(
    "href",
    "/docs/attestation",
  );
  await page.clock.fastForward(3600);
  await expect(map.getByText("Step 1 of 3")).toBeVisible();
  await enclave.click();
  await expect(resume).toBeVisible();
  await expect(enclave).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(map.getByRole("button", { name: "Motion off" })).toBeDisabled();
});

test("switching trace steps keeps the homepage content in place on narrow screens", async ({ page }) => {
  for (const width of [320, 800]) {
    await page.setViewportSize({ width, height: 840 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const quickstart = page.locator("#quickstart");
    const map = page.getByRole("region", { name: "Follow the request" });
    const position = () => quickstart.evaluate((element) => (element as HTMLElement).offsetTop);
    const top = await position();
    for (const name of ["Sonnely gateway", "NEAR AI enclave", "Your client"]) {
      const step = map.getByRole("button", { name, exact: true });
      await step.click();
      await expect(step).toHaveAttribute("aria-pressed", "true");
      expect(await position()).toBe(top);
    }
  }
});

test("the visualizer fades while reading, plays at the footer and shares its setting with the console", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto("/");
  const canvas = page.locator("canvas.ambient-visualizer");
  const pixels = (region: "all" | "left" | "center" | "bottom") =>
    canvas.evaluate((node, region) => {
      const canvas = node as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const { width, height } = canvas;
      const edge = Math.floor(width / 7);
      const box = {
        all: [0, 0, width, height],
        left: [0, 0, edge, height],
        center: [edge, 0, width - 2 * edge, height],
        bottom: [0, height - 90, width, 90],
      }[region];
      const { data } = ctx.getImageData(box[0], box[1], box[2], box[3]);
      let total = 0;
      for (let i = 3; i < data.length; i += 4) total += data[i];
      return total;
    }, region);

  await expect.poll(() => pixels("all")).toBeGreaterThan(300);
  const initial = await pixels("all");
  await expect.poll(() => pixels("all")).not.toBe(initial);
  await page.evaluate(() => scrollTo({ top: innerHeight * 2, behavior: "instant" }));
  await expect.poll(() => pixels("left"), { intervals: [40, 60, 80] }).toBeGreaterThan(100);
  await expect.poll(() => pixels("center")).toBe(0);
  await expect.poll(() => pixels("all")).toBe(0);

  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await expect.poll(() => pixels("bottom")).toBeGreaterThan(100);
  const motion = page.getByRole("switch", { name: "Ambient motion" });
  await motion.click();
  await expect(motion).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => pixels("all")).toBe(0);
  await page.goto("/console/settings");
  await expect(motion).toHaveAttribute("aria-checked", "false");
  await motion.click();
  await expect.poll(() => pixels("all")).toBeGreaterThan(300);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(motion).toBeDisabled();
  await expect.poll(() => pixels("all")).toBe(0);
});

test("public anchors clear the mobile header and follow motion preferences", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const root = page.locator("html");
  const tile = page.locator(".gateway-tile").first();
  await expect(root).toHaveCSS("scroll-behavior", "smooth");
  await expect(tile).toHaveCSS("animation-name", "site-reveal");
  const effects = () =>
    page.evaluate(() => ({
      divider: getComputedStyle(document.querySelector(".home-capabilities")!, "::before").content,
      art: getComputedStyle(document.querySelector(".resource-row")!, "::before").animationName,
    }));
  await expect.poll(effects).toEqual({ divider: "none", art: "home-artwork-drift" });
  await page
    .getByRole("region", { name: "Private AI." })
    .getByRole("link", { name: "API quickstart" })
    .click();
  await expect(page).toHaveURL(/#quickstart$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const top = document.getElementById("quickstart")!.getBoundingClientRect().top;
        const navBottom = document.querySelector(".site-nav")!.getBoundingClientRect().bottom;
        return top > navBottom + 12 && top < navBottom + 60;
      }),
    )
    .toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root).toHaveCSS("scroll-behavior", "auto");
  await expect(tile).toHaveCSS("animation-name", "none");
  await expect.poll(effects).toEqual({ divider: "none", art: "none" });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("switch", { name: "Ambient motion" }).click();
  await expect(root).toHaveCSS("scroll-behavior", "auto");
  await expect(tile).toHaveCSS("animation-name", "none");
  await expect.poll(effects).toEqual({ divider: "none", art: "none" });
});

test("the homepage offers a copyable request and links to the selected model", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const hero = page.getByRole("region", { name: "Private AI." });
  const demo = page.getByRole("region", { name: "Your first API request." });
  await expect(hero.getByRole("img", { name: /forest village/ })).toBeVisible();
  await hero.getByRole("link", { name: "API quickstart" }).click();
  await expect(page).toHaveURL(/#quickstart$/);
  await expect(demo.locator("pre")).toContainText("Turn these handoff notes into a brief.");
  const extract = demo.getByRole("button", { name: "Extract", exact: true });
  await extract.click();
  await expect(extract).toHaveAttribute("aria-pressed", "true");
  await expect(demo.getByText('{ "owner": "Rin", "due": "Friday" }')).toBeVisible();
  await demo.getByRole("button", { name: "Copy request" }).click();
  await expect(demo.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  const command = await page.evaluate(() => navigator.clipboard.readText());
  expect(command).toContain(apiOrigin + apiBasePath + "/chat/completions");
  expect(command).toContain("Bearer $SONNELY_API_KEY");
  const payload = command.match(/-d '([\s\S]+)'$/)?.[1];
  expect(payload).toBeDefined();
  expect(JSON.parse(payload!)).toEqual({
    model: models[1].id,
    messages: [
      {
        role: "user",
        content: "Extract the owner and due date as JSON.\n\nRin will deliver the revised plan on Friday.",
      },
    ],
  });
  await expect(demo.getByRole("link", { name: "Open GLM 5.3 Flash in playground" })).toHaveAttribute(
    "href",
    "/console?model=z-ai%2Fglm-5.3-flash",
  );
  const languages = demo.getByRole("group", { name: "Request language" });
  await languages.getByRole("button", { name: "Python" }).click();
  await demo.getByRole("button", { name: "Copy request" }).click();
  const python = await page.evaluate(() => navigator.clipboard.readText());
  expect(python).toContain("from openai import OpenAI");
  expect(python).toContain('model="' + models[1].id + '"');
  await languages.getByRole("button", { name: "JavaScript" }).click();
  await demo.getByRole("button", { name: "Copy request" }).click();
  const javascript = await page.evaluate(() => navigator.clipboard.readText());
  expect(javascript).toContain("client.chat.completions.create");
  expect(javascript).toContain(apiOrigin + apiBasePath);
  await demo.getByRole("button", { name: "JSON", exact: true }).click();
  expect(
    JSON.parse((await demo.locator('pre[aria-label="Sample response JSON"]').textContent())!),
  ).toMatchObject({
    model: models[1].id,
    choices: [{ message: { role: "assistant", content: '{ "owner": "Rin", "due": "Friday" }' } }],
  });
  const catalog = page.getByRole("region", { name: "Choose your model." });
  const list = catalog.getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(models.length);
  await expect(list.getByRole("link", { name: /DeepSeek V4.1 Flash/ })).toContainText("$0.33 / $1.32");
  await expect(catalog.getByRole("link", { name: "Compare models and pricing" })).toHaveAttribute(
    "href",
    "/models#available-models",
  );
  await expect(
    page.getByRole("navigation", { name: "Platform integrations" }).getByRole("link", { name: /NEAR AI/ }),
  ).toHaveAttribute("href", "/inference#routing");
  await expect(list.getByRole("link", { name: /DeepSeek V4.1 Flash/ })).toHaveAttribute(
    "href",
    "/console?model=deepseek-ai%2FDeepSeek-V4.1-Flash-1017",
  );
  const gateway = page.getByRole("region", { name: "From request to receipt." });
  await expect(gateway.getByRole("link", { name: "Confidential inference" })).toHaveAttribute(
    "href",
    "/inference#evidence",
  );
  await expect(gateway.getByText("Pinned", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(list.getByRole("link", { name: /Qwen 3.6 35B/ })).toBeVisible();
  expect(await list.evaluate((element) => element.scrollWidth)).toBe(
    await list.evaluate((element) => element.clientWidth),
  );
  const previews = page.getByRole("region", { name: "Keys, usage, and credits." });
  const keys = previews.getByRole("tab", { name: "API keys" });
  await expect(keys).toHaveAttribute("aria-selected", "true");
  await keys.focus();
  await keys.press("ArrowDown");
  const usage = previews.getByRole("tab", { name: "Usage" });
  await expect(usage).toBeFocused();
  await expect(previews.getByRole("tabpanel", { name: "Usage" })).toContainText("Input tokens");
  await usage.press("End");
  const funding = previews.getByRole("tabpanel", { name: "Funding" });
  await expect(funding).toContainText("Finalized");
  await funding.scrollIntoViewIfNeeded();
  await expect
    .poll(() => funding.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const faq = page.getByRole("region", { name: "Good to know." });
  const firstQuestion = faq.locator("summary").filter({ hasText: "What can I try without a wallet?" });
  await firstQuestion.focus();
  await firstQuestion.press("Enter");
  await expect(faq.getByText("Explore the model catalog", { exact: false })).toBeVisible();
  await faq.locator("summary").filter({ hasText: "What can I send through the API?" }).click();
  await expect(faq.getByText("Explore the model catalog", { exact: false })).toBeHidden();
  await expect(faq.getByRole("link", { name: "request limits" })).toBeVisible();
});

test("the pricing estimate updates with model and token inputs", async ({ page }) => {
  await page.goto("/pricing");
  const estimate = page.getByRole("region", { name: "Estimate a request" });
  await expect(estimate.locator("output")).toHaveText("$0.00462");
  await estimate.getByLabel("Model").selectOption({ label: "GLM 5.3 Flash" });
  await expect(estimate.locator("output")).toHaveText("$0.00143");
  await expect(estimate.getByText("Input / 1M tokens", { exact: true })).toBeVisible();
  await estimate.getByLabel("Output tokens").fill("0");
  await expect(estimate.locator("output")).toHaveText("$0.00088");
  await estimate.getByLabel("Output tokens").fill("-1");
  await expect(estimate.locator("output")).toHaveText("Check token counts");
  await expect(estimate.getByLabel("Output tokens")).toHaveAttribute("aria-invalid", "true");
});

test("the example trace exposes timing and lets readers inspect each stage by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/observability");
  const trace = page.getByRole("region", { name: "Follow the whole request." });
  await expect(trace.getByRole("button", { name: /Provider attempt/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const evidence = trace.getByRole("button", { name: /Verify evidence/ });
  await evidence.focus();
  await evidence.press("Enter");
  await expect(evidence).toHaveAttribute("aria-pressed", "true");
  await expect(trace.getByText("936–1,128 ms")).toBeVisible();
  await expect(trace.getByText("Check the evidence available for the provider route.")).toBeVisible();
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
  for (const path of [
    "/",
    "/docs",
    "/blog",
    "/contact",
    "/console",
    "/console/blackboxes",
    "/console/admin",
  ]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});
