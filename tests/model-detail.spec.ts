import { expect, test } from "@playwright/test";
import { apiBasePath } from "../lib/api-contract";
import { formatRate } from "../lib/pricing";

const canonicalChatId = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const tinfoilDetail = "/models/tinfoil/deepseek-v4-1-flash";
const imageId = "black-forest-labs/FLUX.2-klein-4B";
const imageDetail = "/models/near-ai/" + imageId;
const discoveryDetail = "/models/near-ai/anthropic/claude-fable-5";

test("every public and workspace catalog row has a provider-specific model card", async ({
  page,
  request,
}) => {
  const catalog = await (await request.get(apiBasePath + "/provider-models")).json();
  const entries = Object.entries(catalog.providers).flatMap(([provider, models]) =>
    (models as { id: string }[]).map(
      ({ id }) => "/models/" + provider + "/" + id.split("/").map(encodeURIComponent).join("/"),
    ),
  );
  for (const path of ["/models", "/console/models"]) {
    await page.goto(path);
    const cards = await page
      .locator(".catalog-list tbody tr h3 a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(cards).toEqual(expect.arrayContaining(entries));
    expect(new Set(cards).size).toBe(cards.length);
  }
  const tinfoilRow = page.locator('[data-provider="tinfoil"][data-upstream-model="deepseek-v4-1-flash"]');
  await tinfoilRow.getByRole("link", { name: "DeepSeek V4.1 Flash" }).click();
  await expect(page).toHaveURL(tinfoilDetail);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("DeepSeek V4.1 Flash");
});

test("chat model details reflect the selected route and provide copyable examples", async ({
  page,
  request,
  context,
}) => {
  const catalog = await (await request.get(apiBasePath + "/models")).json();
  const row = catalog.data.find(({ id }: { id: string }) => id === canonicalChatId);
  const route = row.routes.find(({ provider }: { provider: string }) => provider === "tinfoil");
  await page.goto(tinfoilDetail);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://sonnely.com" + tinfoilDetail,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("DeepSeek V4.1 Flash");
  const chat = page.getByRole("region", { name: "Chat Completions" });
  const responses = page.getByRole("region", { name: "Responses" });
  await expect(responses.getByLabel("cURL request example")).toContainText("/responses");
  await expect(responses.getByLabel("cURL request example")).toContainText(canonicalChatId);
  await expect(chat.getByText("Function calling", { exact: true })).toHaveCount(
    route?.capabilities.tools ? 1 : 0,
  );
  await expect(chat.getByText("Structured outputs", { exact: true })).toHaveCount(
    route?.capabilities.structured_outputs ? 1 : 0,
  );
  if (route) {
    await expect(
      chat.getByText(formatRate(route.price_usd_per_million.input), { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Playground" })).toHaveAttribute(
      "href",
      "/console?model=" + encodeURIComponent(canonicalChatId) + "&provider=tinfoil",
    );
  } else {
    await expect(page.getByText("Unavailable on Sonnely")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Playground" })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Sonnely’s gateway boundary" })).toHaveAttribute(
    "href",
    "/docs/attestation#data-handling",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Other providers for this model" })
      .getByRole("link", { name: "NEAR AI" }),
  ).toHaveAttribute("href", "/models/near-ai/" + canonicalChatId);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const code = await chat.getByLabel("cURL request example").innerText();
  expect(code).toContain('"model": "' + canonicalChatId + '"');
  expect(code).toMatch(/"only":\s*\[\s*"tinfoil"\s*\]/);
  await chat.getByRole("button", { name: "Copy example for Chat Completions" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(code);
});

test("image routes and provider-only cards remain usable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(imageDetail);
  const create = page.getByRole("region", { name: "Image generation" });
  const edit = page.getByRole("region", { name: "Image editing" });
  await expect(create.getByLabel("cURL request example")).toContainText('"model": "' + imageId + '"');
  await expect(edit.getByLabel("cURL request example")).toContainText("image=@input.png;type=image/png");
  await expect(create.getByText("per request", { exact: true })).toBeVisible();
  await expect(edit.getByText("per request", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.goto(discoveryDetail);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Claude Fable 5");
  await expect(page.getByRole("heading", { name: "Provider catalog only" })).toBeVisible();
  await expect(page.getByRole("link", { name: "NEAR AI model catalog" })).toHaveAttribute(
    "href",
    "https://near.ai/models",
  );
  await expect(page.getByRole("button", { name: /Copy.*example/i })).toHaveCount(0);
  expect((await page.goto("/models/near-ai/unknown-model"))?.status()).toBe(404);
});
