import { expect, test } from "@playwright/test";
import { requestLogCsv } from "../lib/request-log-export";
import type { RequestLogRow } from "../lib/request-logs";

const wallet = "11111111111111111111111111111111";
const started = Date.UTC(2026, 10, 24, 11, 0);
const complete: RequestLogRow = {
  id: "j0000000000000000000000000000001",
  time: started,
  keyName: "=IMPORT(1)",
  model: "nomic-embed-text",
  endpoint: "embeddings",
  provider: "tinfoil",
  input: 21,
  output: 0,
  cost: 36,
  status: "complete",
  cachedTokens: 0,
  durationMs: 412,
  settledAt: started + 412,
};
const failed: RequestLogRow = {
  ...complete,
  id: "j0000000000000000000000000000002",
  status: "failed",
  providerStatus: 429,
  outcome: "upstream_error",
};

test("workspace request logs scope history, paginate, and open request metadata", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { wallet, name: "Log customer", balance: 5, role: "member" },
        enabled: true,
        billingEnabled: true,
        inferenceEnabled: true,
      },
    }),
  );
  await page.route("**/api/sonnely/live**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/sonnely/request-logs?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const id = params.get("id");
    if (id) {
      if (id === complete.id || id === failed.id) {
        await route.fulfill({ json: id === failed.id ? failed : complete });
      } else {
        await route.fulfill({ status: 404, json: { error: "Request not found in this workspace." } });
      }
      return;
    }
    if (params.has("cursor")) {
      expect(params.get("cursor")).toBe("next-logs");
      await route.fulfill({ json: { wallet, rows: [failed], nextCursor: null } });
      return;
    }
    if (params.has("status")) {
      expect(params.get("status")).toBe("failed");
      expect(params.get("provider")).toBe("tinfoil");
      expect(params.get("keyName")).toBe(complete.keyName);
      await route.fulfill({ json: { wallet, rows: [failed], nextCursor: null } });
      return;
    }
    await route.fulfill({ json: { wallet, rows: [complete], nextCursor: "next-logs" } });
  });

  await page.goto("/console/logs");
  await expect(page.getByRole("heading", { name: "Request logs", exact: true })).toBeVisible();
  const table = page.getByRole("table", { name: "Request logs", exact: true });
  await expect(table.getByText("Charged $0.000036")).toBeVisible();
  await page.getByRole("button", { name: "Load older requests" }).click();
  await expect(table.getByText("Released")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load older requests" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("tinfoil");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("failed");
  await page.getByRole("textbox", { name: "Key name", exact: true }).fill(complete.keyName);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByText("Released")).toBeVisible();
  await expect(table.getByText("Charged $0.000036")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await table.getByRole("link", { name: new RegExp(failed.id) }).click();
  const detail = page.getByRole("dialog", { name: "Request details" });
  await expect(detail.getByText("Provider status", { exact: true })).toBeVisible();
  await expect(detail.getByText("429", { exact: true })).toBeVisible();
  await expect(detail.getByText("412 ms", { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Copy link to request" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]request=/);

  await page.getByRole("searchbox", { name: "Find a request by reference" }).fill(complete.id);
  await page.getByRole("button", { name: "Find request", exact: true }).click();
  await expect(detail.getByText("Charged $0.000036")).toBeVisible();
  await page.reload();
  await expect(detail.getByText("/embeddings", { exact: true })).toBeVisible();
});

test("export preserves billing and recorded units and neutralizes key labels", () => {
  const csv = requestLogCsv([complete, { ...failed, status: "unreported", keyName: "Jane's, key" }]);
  const [header, charged, held] = csv.trimEnd().split("\r\n");
  expect(header).toContain("charged_usd,reserved_usd,provider_status");
  expect(charged).toContain(",'=IMPORT(1),complete,21,0,0,,412,0.000036,,");
  expect(held).toContain(',"Jane\'s, key",unreported,21,0,0,,412,,0.000036,429');
});

test("request logs require a wallet session", async ({ request }) => {
  for (const path of ["", "?id=" + complete.id]) {
    expect((await request.get("/api/sonnely/request-logs" + path)).status()).toBe(401);
  }
});
