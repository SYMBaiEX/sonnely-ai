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
  await page.route("**/api/sonnely/playground/redact", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ model: "pii-filter" });
    expect(route.request().headers()["authorization"]).toBeUndefined();
    await route.fulfill({
      json: { redacted_text: "Contact [EMAIL]." },
      headers: { "X-Sonnely-Request-Id": "fixture-reference" },
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
    await expect(result).toContainText("fixture-reference");
  }
  await endpoint.selectOption("chat");
  await expect(message).toHaveValue("Draft conversation");
});
