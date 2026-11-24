import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { batchEndpoint, preflightBatch } from "../lib/batch-inference";
import { fixtureWallet } from "./fixtures/wallets";

const wallet = fixtureWallet;
const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";

const row = (id: string, body: Record<string, unknown> = {}) => ({
  custom_id: id,
  method: "POST",
  url: batchEndpoint,
  body: { model, messages: [{ role: "user", content: "A local input." }], max_tokens: 32, ...body },
});
const jsonl = (...rows: unknown[]) => rows.map((item) => JSON.stringify(item)).join("\n") + "\n";
const firstReference = "a".repeat(32);
const secondReference = "b".repeat(32);

test("batch preflight pins routes and rejects duplicate, streaming, incompatible, and unaffordable rows", () => {
  const valid = preflightBatch(jsonl(row("valid")), ["phala"], false);
  expect(valid.issues).toEqual([]);
  expect(valid.rows[0]?.body.provider.only).toEqual(["phala"]);
  expect(valid.rows[0]?.body.max_cost_microusd).toBe(valid.rows[0]?.estimatedMaximum);

  const invalid = preflightBatch(
    jsonl(
      row("one"),
      row("one"),
      row("two", { stream: true }),
      row("three", { provider: { only: ["phala"] } }),
      row("four", { max_cost_microusd: 1 }),
      row("five", { response_format: { type: "json_object" } }),
    ),
    ["near-ai"],
    false,
  );
  expect(invalid.issues.map(({ line }) => line)).toEqual([2, 3, 4, 5, 6]);
  expect(invalid.issues.map(({ detail }) => detail).join(" ")).toMatch(
    /unique.*stream.*provider.*reservation.*Structured/,
  );
});

test("the browser batch pauses, survives reload, and reconciles a lost response with the same checkpoint key", async ({
  page,
  context,
  request,
}) => {
  const catalog = await request.get("/api/sonnely/v1/models");
  expect(catalog.ok()).toBe(true);
  const models: { data: { id: string; routes: { provider: string }[] }[] } = await catalog.json();
  const route = models.data.find(({ id }) => id === model)?.routes[0]?.provider;
  test.skip(!route, "The batch fixture requires an active chat provider.");

  await page.setViewportSize({ width: 320, height: 800 });
  await context.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet, name: "Batch fixture", balance: 1_000_000 },
        enabled: true,
        inferenceEnabled: true,
      },
    }),
  );
  await context.route("**/api/sonnely/live**", (route) => route.fulfill({ status: 204 }));
  const sent: { key?: string; body: unknown; startedAt: number }[] = [];
  let releaseFirst = () => {};
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await context.route("**/api/sonnely/batch/chat", async (route) => {
    const headers = route.request().headers();
    expect(headers["x-sonnely-batch-wallet"]).toBe(wallet);
    sent.push({
      key: headers["idempotency-key"],
      body: route.request().postDataJSON(),
      startedAt: Date.now(),
    });
    if (sent.length === 1) {
      await firstCanFinish;
      await route.fulfill({
        headers: { "X-Sonnely-Request-Id": firstReference },
        json: {
          choices: [{ message: { role: "assistant", content: "First response" } }],
        },
      });
    } else if (sent.length === 2) {
      await route.abort("failed");
    } else {
      await route.fulfill({
        status: 409,
        headers: { "X-Sonnely-Request-Id": secondReference },
        json: { error: { message: "An existing request was found." } },
      });
    }
  });

  await page.goto("/console/batch");
  const upload = page.getByLabel("Choose JSONL file");
  await expect(upload).toBeEnabled();
  await upload.setInputFiles({
    name: "invalid.jsonl",
    mimeType: "application/x-ndjson",
    buffer: Buffer.from(jsonl(row("same"), row("same"))),
  });
  await expect(page.getByRole("alert").filter({ hasText: "issue" })).toContainText(
    "Each custom_id must be unique.",
  );
  await upload.setInputFiles({
    name: "batch.jsonl",
    mimeType: "application/x-ndjson",
    buffer: Buffer.from(
      jsonl(row("first", { provider: { only: [route] } }), row("second", { provider: { only: [route] } })),
    ),
  });
  await expect(page.getByRole("heading", { name: "batch.jsonl" })).toBeFocused();
  await expect(page.getByText("2 requests ready to run.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(sent).toHaveLength(0);

  await page.getByRole("button", { name: "Run batch" }).click();
  try {
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ body: { model, provider: { only: [route] } }, key: /^batch:.+:0$/ });
    const secondTab = await context.newPage();
    try {
      await secondTab.goto("/console/batch");
      await secondTab.getByRole("button", { name: "Resume batch" }).click();
      await expect(secondTab.getByRole("alert").filter({ hasText: "another tab" })).toBeVisible();
      expect(sent).toHaveLength(1);
    } finally {
      await secondTab.close();
    }
    await page.getByRole("button", { name: "Pause batch" }).click();
  } finally {
    releaseFirst();
  }
  await expect(page.getByText("Batch paused. Your progress is saved on this device.")).toBeVisible();
  expect(sent).toHaveLength(1);
  await page.reload();
  await expect(
    page.locator("article").filter({ hasText: "first" }).getByText("Completed", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Resume batch" }).click();
  await expect(page.getByRole("button", { name: "Retry interrupted request second" })).toBeVisible({
    timeout: 7000,
  });
  expect(sent).toHaveLength(2);
  expect(sent[1]!.startedAt - sent[0]!.startedAt).toBeGreaterThanOrEqual(4500);
  await page.getByRole("button", { name: "Retry interrupted request second" }).click();
  await expect(page.getByText("This request already started.", { exact: false })).toBeVisible({
    timeout: 7000,
  });
  expect(sent[2]?.key).toBe(sent[1]?.key);
  expect(sent[2]?.body).toEqual(sent[1]?.body);
  await expect(
    page.locator("article").filter({ hasText: "second" }).getByRole("link", { name: "Request details" }),
  ).toHaveAttribute("href", "/console/logs?request=" + secondReference);

  for (const [name, customId, reference] of [
    ["Download results", "first", firstReference],
    ["Download errors and status", "second", secondReference],
  ]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const download = await event;
    const content = await readFile((await download.path())!, "utf8");
    expect(JSON.parse(content)).toMatchObject({ custom_id: customId, request_id: reference });
  }

  await page.getByRole("button", { name: "Clear saved batch" }).click();
  await page.getByRole("button", { name: "Clear this batch" }).click();
  await expect(upload).toBeFocused();
  await page.reload();
  await expect(upload).toBeEnabled();
  expect(sent).toHaveLength(3);
});

test("batch dispatch requires a same-origin signed-in wallet", async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const path = "/api/sonnely/batch/chat";
  const invalidOrigin = await request.post(path, {
    headers: { origin: "https://example.invalid" },
    data: {},
  });
  expect(invalidOrigin.status()).toBe(403);
  const unauthenticated = await request.post(path, { headers: { origin }, data: {} });
  expect(unauthenticated.status()).toBe(401);

  const convexUrl = process.env.SONNELY_TEST_LOCAL_CONVEX;
  const secret = process.env.SONNELY_TEST_CONVEX_SECRET;
  if (
    !convexUrl ||
    !secret ||
    new URL(convexUrl).hostname !== "127.0.0.1" ||
    new URL(origin).hostname !== "127.0.0.1"
  )
    return;

  const token = randomBytes(32).toString("hex");
  const session = createHash("sha256").update(token).digest("hex");
  const client = new ConvexHttpClient(convexUrl);
  await client.mutation(api.sonnely.signIn, {
    secret,
    session,
    wallet,
    nonce: randomBytes(20).toString("hex"),
    referral: randomBytes(8).toString("hex"),
    expires: Date.now() + 60_000,
  });
  const headers = {
    origin,
    Cookie: "sonnely_session=" + token,
    "Idempotency-Key": "batch:12345678-1234-4567-89ab-123456789abc:1",
    "X-Sonnely-Batch-Wallet": "different-wallet",
  };
  expect((await request.post(path, { headers, data: {} })).status()).toBe(401);
  expect(
    (
      await request.post(path, {
        headers: { ...headers, "X-Sonnely-Batch-Wallet": wallet },
        data: { stream: true },
      })
    ).status(),
  ).toBe(400);
});
