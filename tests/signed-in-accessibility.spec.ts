import { expect, test, type Page } from "@playwright/test";
import { fixtureWallet } from "./fixtures/wallets";

async function mockWorkspace(page: Page) {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile: { name: "Audit workspace", wallet: fixtureWallet, balance: 5_000_000 },
        enabled: true,
        inferenceEnabled: true,
        billingEnabled: true,
        cluster: "mainnet",
      },
    }),
  );
}

test("key management exposes context and moves and restores keyboard focus", async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 320, height: 800 });
  const name = "Deployment";
  await page.route("**/api/sonnely/keys", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: { key: "sonnely_fixture_only" } })
      : route.fulfill({
          json: [
            {
              id: "fixture-key",
              name,
              prefix: "sonnely_fixture",
              created: 1730000000000,
              cap: null,
              dailyCap: null,
              expires: null,
              revoked: false,
              todaySpent: 0,
            },
          ],
        }),
  );
  await page.goto("/console/keys");
  const edit = page.getByRole("button", { name: "Edit Deployment" });
  await edit.press("Enter");
  await expect(page.getByRole("heading", { name: "Edit Deployment" })).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
  await expect(edit).toBeFocused();
  const create = page.getByRole("button", { name: "Create key", exact: true });
  await create.press("Enter");
  await expect(page.getByRole("heading", { name: "Create an API key" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  const submit = page.locator('form button[type="submit"]');
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await submit.press("Enter");
  await expect(page.getByRole("heading", { name: "Save your new key" })).toBeFocused();
  await page.getByRole("button", { name: "Done", exact: true }).press("Enter");
  await expect(create).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("signed-in wallet options close with Escape and return focus", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/console/settings");
  const wallet = page.getByRole("button", { name: /wallet options/ });
  await wallet.press("Enter");
  await expect(wallet).toHaveAttribute("aria-expanded", "true");
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await signOut.focus();
  await page.keyboard.press("Escape");
  await expect(wallet).toBeFocused();
  await expect(wallet).toHaveAttribute("aria-expanded", "false");
  await expect(signOut).toBeHidden();
});

test("support acknowledges a submitted request through an established status region", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/api/sonnely/support-tickets*", (route) =>
    route.fulfill({ json: { page: [], isDone: true, continueCursor: "" } }),
  );
  await page.route("**/api/sonnely/support-open", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/console/support");
  const form = page.getByRole("region", { name: "New request" });
  const status = form.getByRole("status");
  await expect(status).toBeAttached();
  await form.getByRole("textbox", { name: "Email" }).fill("audit@example.com");
  await form.getByRole("textbox", { name: "Message" }).fill("Accessibility fixture request");
  await form.getByRole("button", { name: "Submit request" }).press("Enter");
  await expect(status).toHaveText("Request sent. Replies appear in your request list.");
});

test("the playground switches endpoints in one workspace and preserves the chat draft", async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 320, height: 800 });
  let calls = 0;
  await page.route("**/api/sonnely/playground/redact", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ model: "pii-filter" });
    expect(route.request().headers()["authorization"]).toBeUndefined();
    calls += 1;
    await route.fulfill({
      json: { redacted_text: "Contact [EMAIL]." },
      headers: { "X-Sonnely-Request-Id": "fixture-reference-" + calls },
    });
  });
  await page.goto("/console");
  const endpoint = page.getByRole("combobox", { name: "Endpoint", exact: true });
  await expect(endpoint).toHaveValue("chat");
  await expect(page.getByRole("heading", { name: "Playground", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "API reference", exact: true })).toHaveCount(0);
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await message.fill("Draft conversation");
  await endpoint.selectOption("realtime");
  await expect(page.getByText("WS /realtime", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Upload file")).toBeVisible();
  await endpoint.selectOption("redact");
  await expect(page.getByText("POST /redact", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const request = page.getByRole("region", { name: "Request", exact: true });
  const input = request.getByRole("textbox", { name: "Input text" });
  await input.fill("Private sample for this endpoint");
  await endpoint.selectOption("realtime");
  await endpoint.selectOption("redact");
  await expect(input).toHaveValue("Private sample for this endpoint");
  const run = page.getByRole("button", { name: "Run request" });
  if (await run.isDisabled()) {
    await expect(page.getByText("This route is currently unavailable.")).toBeVisible();
  } else {
    await run.press("Enter");
    const result = page.getByRole("region", { name: "Result" });
    await expect(result.getByRole("status")).toHaveText("Request completed.");
    await expect(result).toContainText("Contact [EMAIL].");
    await expect(result).toContainText("fixture-reference");
    await endpoint.selectOption("chat");
    await endpoint.selectOption("redact");
    await expect(result).toContainText("fixture-reference-1");
    await run.press("Enter");
    await expect(result).toContainText("fixture-reference-2");
    await page.getByText("Recent runs", { exact: true }).click();
    await page.locator(".playground-run-list").getByRole("button").last().click();
    await expect(result).toContainText("fixture-reference-1");
    expect(calls).toBe(2);
  }
  await endpoint.selectOption("chat");
  await expect(message).toHaveValue("Draft conversation");
});

test("playground results preview images and summarize ranked documents", async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 800 });
  const image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR7sAAAAASUVORK5CYII=";
  await page.route("**/api/sonnely/playground/images/generations", (route) =>
    route.fulfill({
      json: { data: [{ b64_json: image }] },
      headers: { "X-Sonnely-Request-Id": "image-fixture" },
    }),
  );
  await page.route("**/api/sonnely/playground/rerank", (route) =>
    route.fulfill({ json: { results: [{ index: 1, relevance_score: 0.875 }] } }),
  );
  await page.goto("/console");
  const endpoint = page.getByRole("combobox", { name: "Endpoint", exact: true });
  await endpoint.selectOption("images/generations");
  const run = page.getByRole("button", { name: "Run request" });
  test.skip(await run.isDisabled(), "The image provider is disabled in this test deployment.");
  await run.click();
  const output = page.getByRole("region", { name: "Result" });
  await expect(output.getByRole("img", { name: "Generated output" })).toBeVisible();
  await expect(output.getByRole("link", { name: "Download image" })).toHaveAttribute(
    "download",
    "sonnely-image.png",
  );
  await expect(output.getByRole("link", { name: "View usage" })).toHaveAttribute(
    "href",
    "/console/usage#recent-request-references",
  );
  await endpoint.selectOption("rerank");
  await run.click();
  const ranked = output.getByRole("list", { name: "Ranked documents" });
  await expect(ranked).toContainText("How to resize an image");
  await expect(ranked).toContainText("0.875");
  await output.getByText("View raw JSON", { exact: true }).click();
  await expect(output.getByLabel("Raw response")).toContainText('"index": 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
