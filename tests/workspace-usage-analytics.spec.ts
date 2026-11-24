import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { fixtureWallet } from "./fixtures/wallets";

const time = Date.now();
const baseRows = [
  {
    id: "req-near",
    time,
    provider: "near-ai",
    model: "z-ai/glm-5.3-flash",
    keyName: "Deployment",
    keyId: "key-111111",
    status: "complete",
    input: 120,
    output: 80,
    cached: 100,
    cost: 21_000,
    providerMs: 220,
  },
  {
    id: "req-phala",
    time,
    provider: "phala",
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    keyName: "Deployment",
    keyId: "key-222222",
    status: "failed",
    input: 0,
    output: 0,
    cost: 0,
    providerMs: 1540,
  },
  {
    id: "req-tinfoil",
    time,
    provider: "tinfoil",
    model: "nomic-embed-text",
    keyName: "=2+2",
    keyId: "key-333333",
    status: "unreported",
    input: 0,
    output: 0,
    cost: 18_000,
  },
];

async function mockUsage(page: Page, rows = baseRows) {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { name: "Usage test", wallet: fixtureWallet, balance: 5_000_000 },
        enabled: true,
        inferenceEnabled: true,
        billingEnabled: true,
        cluster: "mainnet",
      },
    }),
  );
  await page.route("**/api/sonnely/live?*", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/sonnely/usage?*", (route) => {
    const days = new URL(route.request().url()).searchParams.get("days");
    return route.fulfill({ json: days === "7" ? rows.slice(0, 1) : rows });
  });
}

test("Usage scopes charts, breakdowns, statuses, and exports to the same filters", async ({ page }) => {
  await mockUsage(page);
  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto("/console/usage");
  const filters = page.getByRole("region", { name: "Usage filters" });
  const summary = page.locator(".usage-stats");
  const stat = (name: string) =>
    summary.locator(".stat").filter({ has: page.getByText(name, { exact: true }) });
  const breakdown = page.getByRole("region", { name: "Request breakdown" });

  await expect(filters.getByRole("status")).toHaveText("3 of 3 requests shown.");
  await expect(stat("Success rate")).toContainText("50%");
  await expect(stat("Cached input")).toContainText("100");
  await expect(stat("Provider duration p95")).toContainText("1.54 s");
  await expect(stat("Held credits")).toContainText("$0.02");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.getByRole("button", { name: "By provider" }).click();
  await expect(breakdown.getByRole("rowheader").first()).toHaveText("NEAR AI");
  await page.getByRole("combobox", { name: "Sort groups" }).selectOption("failed");
  await expect(breakdown.getByRole("rowheader").first()).toHaveText("Phala");

  await page.getByRole("button", { name: "By key" }).click();
  await expect(breakdown.getByRole("rowheader", { name: "Deployment · 111111" })).toBeVisible();
  await expect(breakdown.getByRole("rowheader", { name: "Deployment · 222222" })).toBeVisible();

  await page.getByRole("combobox", { name: "Chart metric" }).selectOption("Cached input");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Cached input by day" }).getByRole("cell", { name: "100" }),
  ).toBeVisible();

  await filters.getByRole("combobox", { name: "Provider", exact: true }).selectOption("phala");
  await expect(filters.getByRole("status")).toHaveText("1 of 3 requests shown.");
  await expect(breakdown.getByRole("rowheader", { name: "Deployment · 111111" })).toHaveCount(0);
  await expect(stat("Success rate")).toContainText("0%");
  await expect(stat("Cached input").getByText("—")).toBeVisible();

  await filters.getByRole("combobox", { name: "API key" }).selectOption("key:key-111111");
  await expect(filters.getByRole("status")).toHaveText("0 of 3 requests shown.");
  await expect(page.getByText("No requests match these filters.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  await filters.getByRole("button", { name: "Clear filters" }).press("Enter");
  await expect(filters.getByRole("combobox", { name: "Provider", exact: true })).toBeFocused();
  await filters.getByRole("combobox", { name: "Model" }).selectOption("nomic-embed-text");
  await filters.getByRole("combobox", { name: "Status" }).selectOption("unreported");
  await expect(filters.getByRole("status")).toHaveText("1 of 3 requests shown.");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await (await downloaded).path();
  expect(await readFile(file, "utf8")).toBe(
    "time_utc,request_id,provider,model,key_name,key_id,status,input_tokens,cached_input_tokens,output_tokens,charged_usd,held_usd,provider_duration_ms\r\n" +
      `${new Date(time).toISOString()},req-tinfoil,tinfoil,nomic-embed-text,'=2+2,key-333333,unreported,0,,0,0,0.018,\r\n`,
  );

  await filters.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "Date range" }).selectOption("7");
  await expect(filters.getByRole("status")).toHaveText("1 of 1 requests shown.");
  await expect(stat("Success rate")).toContainText("100%");
});

test("Usage identifies capped activity when filters narrow a 1,000-row sample", async ({ page }) => {
  await mockUsage(
    page,
    Array.from({ length: 1000 }, (_, index) => ({ ...baseRows[0], id: `req-${index}` })),
  );
  await page.goto("/console/usage");
  const filters = page.getByRole("region", { name: "Usage filters" });
  await expect(filters.getByRole("status")).toContainText("1,000 of 1,000 requests shown.");
  await filters.getByRole("combobox", { name: "Status" }).selectOption("failed");
  await expect(filters.getByRole("status")).toContainText("0 of 1,000 requests shown.");
  await expect(filters.getByRole("status")).toContainText(
    "Analytics and CSV cover the 1,000 most recent requests",
  );
});

test("Usage shows observed provider measurements as a request settles live", async ({ page, baseURL }) => {
  test.skip(
    !baseURL || new URL(baseURL).hostname !== "127.0.0.1" || !existsSync(".env.local"),
    "Uses a loopback deployment",
  );
  process.loadEnvFile(".env.local");
  test.skip(
    !process.env.CONVEX_URL || new URL(process.env.CONVEX_URL).hostname !== "127.0.0.1",
    "Uses a loopback deployment",
  );
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  const { db, secret } = backend();
  const token = randomUUID();
  const auth = { secret, session: hash(token) };
  await db.mutation(api.sonnely.signIn, {
    ...auth,
    wallet: randomUUID(),
    nonce: randomUUID(),
    expires: Date.now() + 60_000,
    referral: randomUUID(),
  });
  const reference = randomUUID();
  await db.mutation(api.sonnely.createDeposit, {
    ...auth,
    reference,
    amount: 5_000_000,
    cluster: "mainnet",
    recipient: "fixture",
    mint: "fixture",
  });
  await db.mutation(api.sonnely.confirmDeposit, { ...auth, reference, signature: randomUUID() });
  const id = await db.mutation(api.sonnely.reserve, {
    ...auth,
    model: "z-ai/glm-5.3-flash",
    cost: 20_000,
  });
  await page.context().addCookies([{ name: "sonnely_session", value: token, url: baseURL! }]);

  const stream = page.waitForRequest((request) => request.url().includes("/api/sonnely/live?days=30"));
  await page.goto("/console/usage");
  await stream;
  const stats = page.getByRole("group", { name: "Usage summary" });
  await expect(stats.locator(".stat").filter({ hasText: "Held credits" })).toContainText("$0.02");
  await expect(stats.locator(".stat").filter({ hasText: "Cached input" })).toContainText(
    "No cache measurements",
  );

  const now = Date.now();
  await db.mutation(api.sonnely.settle, {
    secret,
    id,
    input: 90,
    output: 111,
    cost: 8_000,
    status: "complete",
    usageMaxDetails: {
      usage: { inputTokens: 30, cacheReadTokens: 60, outputTokens: 111 },
      timing: {
        requestAt: now - 340,
        reservationAt: now - 330,
        providerAt: now - 320,
        providerDoneAt: now - 20,
        settlementAt: now,
      },
    },
  });
  await expect(stats.locator(".stat").filter({ hasText: "Cached input" })).toContainText("60");
  await expect(stats.locator(".stat").filter({ hasText: "Provider duration p95" })).toContainText("300 ms");
  await expect(stats.locator(".stat").filter({ hasText: "Credit balance" })).toContainText("$4.992");
});
