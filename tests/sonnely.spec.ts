import { fixtureWallet } from "./fixtures/wallets";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import bs58 from "bs58";
import { models } from "../lib/models";

function createWallet() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const bytes = Array.from(publicKey.export({ type: "spki", format: "der" }).subarray(-32));
  const wallet = bs58.encode(Uint8Array.from(bytes));
  return { wallet, bytes, sign: (message: Uint8Array) => [...sign(null, message, privateKey)] };
}

async function registerWallet(context: BrowserContext) {
  const identity = createWallet();
  await context.exposeFunction("signFixture", (message: number[]) => identity.sign(Uint8Array.from(message)));
  await context.addInitScript(({ wallet, bytes }) => {
    const chain = "solana:mainnet";
    const account = {
      address: wallet,
      publicKey: Uint8Array.from(bytes),
      chains: [chain],
      features: ["solana:signMessage"],
    };
    const browserWindow = window as typeof window & { signFixture: (message: number[]) => Promise<number[]> };
    const fixture = {
      version: "1.0.0",
      name: "Test Solana Wallet",
      icon: "data:image/png;base64,",
      accounts: [],
      chains: [chain],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: async ({ message }: { message: Uint8Array }) => [
            {
              signedMessage: message,
              signature: Uint8Array.from(await browserWindow.signFixture([...message])),
            },
          ],
        },
      },
    };
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent<{ register: (wallet: unknown) => void }>).detail.register(fixture);
    });
  }, identity);
  return identity.wallet;
}

test("public routes and console work across desktop and mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Private AI.", level: 1 })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Models" })
    .click();
  await page.getByRole("searchbox", { name: "Find a model" }).fill("Qwen");
  await expect(page.getByRole("heading", { name: "Qwen 3.6 35B" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DeepSeek V4.1 Flash" })).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("heading", { name: "Qwen 3.6 35B", exact: true }) })
    .getByRole("link", { name: "Open in chat" })
    .click();
  const route = page.getByRole("button", { name: /Qwen 3\.6 35B/ });
  await expect(route).toContainText("Qwen 3.6 35B");
  await route.click();
  const picker = page.getByRole("dialog", { name: "Choose a model" });
  await expect(picker.getByRole("radio", { name: /^Qwen 3.6 35B/ })).toBeChecked();
  await picker.getByText("GLM 5.3 Flash", { exact: true }).click();
  await picker.getByRole("button", { name: "Use model" }).click();
  await expect(route).toContainText("GLM 5.3 Flash");
  await expect(route).toBeFocused();
  await page.getByRole("button", { name: "What is a trusted execution environment?" }).click();
  await expect(page.getByText("Sample transcript")).toBeVisible();
  await page.getByRole("button", { name: "Jump to ⌘ K" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Usage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "All pages" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "light", exact: true }).click();
  await expect(page.locator(".console")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator(".console")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  for (const path of ["/pricing", "/docs", "/blog", "/blog/request-path", "/contact", "/console/billing"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.locator(".site-nav .brand-icon")).toBeVisible();
  await expect(page.locator(".site-nav .brand-icon")).toHaveCSS("background-image", /sonnely-blue\.svg/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.goto("/console");
  await expect(page.locator(".compact-brand .brand-icon")).toBeVisible();
  await expect(page.locator(".compact-brand .brand-wordmark")).toBeVisible();
  const workspaceMenu = page.getByRole("button", { name: "Open workspace menu" });
  await workspaceMenu.click();
  const workspaceNav = page.getByRole("navigation", { name: "Workspace navigation", exact: true });
  await expect(workspaceNav.getByRole("link", { name: "Playground" })).toBeFocused();
  const bar = (await page.locator(".console-bar").boundingBox())!;
  expect((await page.locator(".rail-open").boundingBox())!.y).toBeGreaterThan(bar.y + bar.height);
  await page.keyboard.press("Escape");
  await expect(workspaceMenu).toBeFocused();
  await expect(workspaceNav).toBeHidden();
  await route.click();
  await expect(picker.getByRole("button", { name: "Apply route" })).toBeInViewport();
  await picker.getByRole("button", { name: "Cancel" }).click();
  await expect(route).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(page.locator(".compact-brand .brand-icon")).toHaveCSS("background-image", /sonnely-blue\.svg/);
});

test("Playground saves chats only after opt-in and restores the selected conversation", async ({ page }) => {
  const wallet = fixtureWallet;
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: { profile: { wallet, name: "History fixture", balance: 1_000_000 }, inferenceEnabled: true },
    }),
  );
  await page.route("**/api/sonnely/live", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/sonnely/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"content":"**History fixture response**"}}]}\n\ndata: [DONE]\n\n',
    }),
  );
  await page.goto("/console");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Remember this chat");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Model response ready in Messages." }),
  ).toBeAttached();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeFocused();
  const reply = page
    .getByRole("region", { name: "Messages" })
    .getByText("History fixture response", { exact: true });
  await expect(reply).toBeVisible();
  await expect(reply).toHaveJSProperty("tagName", "STRONG");
  expect(await page.evaluate((key) => localStorage.getItem(key), "sonnely.chats." + wallet)).toBeNull();

  await page.getByRole("button", { name: "Save chats on this device" }).click();
  await expect(reply).toBeVisible();
  await page.reload();
  await expect(reply).toBeVisible();

  await page.goto("/console?model=Qwen/Qwen3.6-35B-A3B-FP8");
  await expect(page.getByRole("button", { name: /Qwen 3\.6 35B/ })).toContainText("Qwen 3.6 35B");
  await expect(reply).toHaveCount(0);
  const history = page.getByRole("button", { name: "History", exact: true });
  await history.click();
  await expect(page.getByRole("searchbox", { name: "Search conversations" })).toBeFocused();
  const sidebar = page.getByRole("complementary", { name: "Conversation history" });
  await sidebar.getByRole("button", { name: "Remember this chat", exact: true }).click();
  await expect(reply).toBeVisible();
  await page.locator(".chat-tools").getByRole("button", { name: "New chat", exact: true }).click();
  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "What are you working on?" })).toBeVisible();
  await history.click();
  await expect(sidebar.getByRole("button", { name: "Remember this chat", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(history).toBeFocused();

  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page.getByRole("switch", { name: "Save on this device" }).click();
  await expect(page.getByRole("switch", { name: "Save on this device" })).not.toBeChecked();
  await page.goto("/console");
  await expect(page.getByRole("button", { name: "Save chats on this device" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Remember this chat", exact: true })).toHaveCount(0);
});

test("wallet account workflow scopes keys, referrals, and support requests", async ({
  page,
  browser,
  baseURL,
}) => {
  await registerWallet(page.context());
  await page.goto("/console/keys");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Test Solana Wallet" }).click();
  await page.getByRole("button", { name: "Close setup" }).click();
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Local fixture");
  await page.getByRole("spinbutton", { name: "Daily cap (USD)" }).fill("5");
  await page.locator("form").getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByRole("region", { name: "New API key" }).locator("code")).toHaveText(
    /^sonnely_live_/,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Local fixture", { exact: true })).toBeVisible();
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.locator(".compact-brand .brand-wordmark")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".console-bar .wallet-button")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Open workspace menu" })).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".console-bar .wallet-button")).toHaveCSS("width", "44px");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".compact-brand .brand-wordmark")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const record = page.getByRole("row").filter({ hasText: "Local fixture" });
  await expect(record.getByText("Active", { exact: true })).toBeInViewport();
  await expect(record.getByRole("button", { name: "Revoke Local fixture", exact: true })).toBeInViewport();
  expect(await page.locator(".key-records .table-wrap").evaluate((element) => element.scrollWidth)).toBe(
    await page.locator(".key-records .table-wrap").evaluate((element) => element.clientWidth),
  );
  await page.setViewportSize(desktop);
  await page.getByRole("button", { name: "Revoke Local fixture", exact: true }).click();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Display name" }).fill("Test operator");
  const username = "reader_" + (await import("node:crypto")).randomUUID().slice(0, 8);
  await page.getByRole("textbox", { name: "Username" }).fill(username.toUpperCase());
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");

  await page.getByRole("link", { name: "Referrals", exact: true }).click();
  await expect(page.getByText("@" + username, { exact: true })).toBeVisible();
  const invite = await page.locator("code").first().textContent();
  expect(invite).toContain("?ref=");
  const other = await browser.newContext({ baseURL });
  const invitedWallet = await registerWallet(other);
  try {
    const guest = await other.newPage();
    await guest.goto(invite!);
    await guest.getByRole("button", { name: "Connect wallet" }).click();
    await guest.getByRole("button", { name: "Test Solana Wallet" }).click();
    await expect(guest.getByRole("button", { name: new RegExp(invitedWallet.slice(0, 4)) })).toBeVisible();
    await guest.goto("/console/keys");
    await guest.getByRole("button", { name: "Close setup" }).click();
    await expect(guest.getByText("No API keys to show")).toBeVisible();
    await page.reload();
    await expect(page.getByText(invitedWallet.slice(0, 4) + "…" + invitedWallet.slice(-4))).toBeVisible();
  } finally {
    await other.close();
  }

  await page.goto("/contact");
  await page.getByRole("textbox", { name: "Email" }).fill("fixture@example.com");
  await page.getByRole("textbox", { name: "Message" }).fill("Local browser test of support submission.");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("status")).toContainText("Request saved.");
});

test("wallet challenges reject wrong origins, invalid signatures, and replay", async ({
  request,
  baseURL,
}) => {
  const { wallet, sign } = createWallet();
  const origin = baseURL!;
  const challengeRoute = "/api/sonnely/challenge";
  const verifyRoute = "/api/sonnely/verify";
  const badOrigin = await request.post(challengeRoute, {
    data: { wallet },
    headers: { origin: "https://example.org" },
  });
  expect(badOrigin.status()).toBe(403);
  const challenge = await request.post(challengeRoute, { data: { wallet }, headers: { origin } });
  expect(challenge.ok()).toBeTruthy();
  const data = (await challenge.json()) as { message: string };
  const cookie = challenge.headers()["set-cookie"].split(";")[0];
  const invalid = await request.post(verifyRoute, {
    data: { wallet, signature: Array(64).fill(0) },
    headers: { origin, cookie },
  });
  expect(invalid.status()).toBe(401);
  const body = { wallet, signature: sign(new TextEncoder().encode(data.message)) };
  const valid = await request.post(verifyRoute, { data: body, headers: { origin, cookie } });
  expect(valid.ok()).toBeTruthy();
  const replay = await request.post(verifyRoute, { data: body, headers: { origin, cookie } });
  expect(replay.status()).toBe(400);
  const list = await request.get("/api/sonnely/v1/models");
  expect((await list.json()).data).toHaveLength(models.length);
  const unauthorized = await request.post("/api/sonnely/v1/chat/completions", { data: {} });
  expect(unauthorized.status()).toBe(401);
});

test("Sonnely API paths and compatibility routes serve the same model list", async ({ request }) => {
  const current = await request.get("/api/sonnely/v1/models");
  const previous = await request.get("/v1/models");
  expect(current.ok()).toBeTruthy();
  expect(previous.ok()).toBeTruthy();
  expect(await current.json()).toEqual(await previous.json());
  const account = await request.get("/api/sonnely/session");
  const previousAccount = await request.get("/api/relay/session");
  expect(account.ok()).toBeTruthy();
  expect(previousAccount.ok()).toBeTruthy();
  expect(await account.json()).toEqual(await previousAccount.json());
});

test("the retired Sonnely app sends bookmarks to the current site and rejects legacy API calls", async ({
  request,
}) => {
  const headers = { Host: "app.sonnely.com" };
  const bookmark = await request.get("/dashboard/api", { headers, maxRedirects: 0 });
  expect(bookmark.status()).toBe(308);
  expect(bookmark.headers().location).toBe("https://sonnely.com/console/keys");
  const oldApp = await request.get("/", { headers, maxRedirects: 0 });
  expect(oldApp.status()).toBe(308);
  expect(oldApp.headers().location).toBe("https://sonnely.com/");
  for (const response of [
    await request.post("/api/v1/chat/completions", { data: { model: "legacy" }, maxRedirects: 0 }),
    await request.get("/v1/models", { headers, maxRedirects: 0 }),
  ]) {
    expect(response.status()).toBe(410);
    expect(response.headers().location).toBeUndefined();
    expect(await response.json()).toMatchObject({
      error: { code: "legacy_api_retired", base_url: "https://sonnely.com/api/sonnely/v1" },
    });
  }
});

test("published guides link to supported endpoints and workflows", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Sonnely documentation", exact: true })).toBeVisible();
  await page.locator("a#api").click();
  const baseUrl = page
    .locator(".docs-api-base")
    .getByText("https://sonnely.com/api/sonnely/v1", { exact: true });
  await expect(baseUrl).toBeVisible();
  await page.getByRole("link", { name: "errors and recovery", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Errors and recovery", exact: true })).toBeVisible();
  await page.goto("/models");
  await expect(page.getByRole("table", { name: "Model rates and provider context" })).toContainText(
    "Qwen 3.6 35B",
  );
  await page.goto("/blog/rotate-api-keys");
  await expect(page.getByRole("heading", { name: "Revoke the old key" })).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByRole("form", { name: "Send a support request" })).toBeVisible();
});

test("the open Usage page receives Convex balance and usage changes without a reload", async ({
  page,
  baseURL,
}) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Uses a local Convex test account");
  process.loadEnvFile(".env.local");
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  const { db, secret } = backend();
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:"))
    throw new Error("This test requires a loopback Convex deployment.");
  await registerWallet(page.context());
  await page.goto("/console/usage");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const streamOpen = page.waitForRequest((request) => request.url().includes("/api/sonnely/live?days=30"));
  await page.getByRole("button", { name: "Test Solana Wallet" }).click();
  expect((await streamOpen).method()).toBe("GET");
  await expect(page.locator(".stat").filter({ hasText: "Credit balance" })).toContainText("$0.00");
  const cookies = await page.context().cookies();
  const token = cookies.find((item) => item.name === "sonnely_session")?.value;
  if (!token) throw new Error("No local wallet session.");
  const auth = { secret, session: hash(token) };
  const reference = randomUUID();
  await db.mutation(api.sonnely.createDeposit, {
    ...auth,
    amount: 5_000_000,
    cluster: "mainnet",
    reference,
    recipient: "fixture",
    mint: "fixture",
  });
  await db.mutation(api.sonnely.confirmDeposit, { ...auth, reference, signature: randomUUID() });
  await expect(page.locator(".stat").filter({ hasText: "Credit balance" })).toContainText("$5.00");
  const id = await db.mutation(api.sonnely.reserve, {
    ...auth,
    model: "z-ai/glm-5.3-flash",
    cost: 2_000,
  });
  await db.mutation(api.sonnely.settle, {
    secret,
    id,
    input: 111,
    output: 399,
    status: "complete",
    cost: 210,
  });
  await expect(page.locator(".stat").filter({ hasText: "Credit balance" })).toContainText("$4.99979");
  await expect(page.locator(".stat").filter({ hasText: "Spend" })).toContainText("$0.000210");
  await expect(
    page.getByRole("region", { name: "Request breakdown" }).getByRole("row", { name: /GLM 5.3 Flash/ }),
  ).toContainText("399");
});

test("launch endpoints describe this Solana workspace and its actual API", async ({ request }) => {
  for (const [path, heading] of [
    ["/terms", "Terms of Service"],
    ["/privacy", "Privacy Notice"],
    ["/status", "Service status"],
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(heading);
  }
  const health = await request.get("/api/health", { maxRedirects: 0 });
  expect([200, 503]).toContain(health.status());
  expect(await health.json()).toMatchObject({
    service: "sonnely-solana",
    checks: { depositRecovery: expect.any(Boolean) },
  });
  const openapi = await request.get("/api/openapi", { maxRedirects: 0 });
  expect(openapi.status()).toBe(200);
  const spec = await openapi.json();
  expect(spec.servers[0].url).toBe("https://sonnely.com/api/sonnely/v1");
  const modelList = await (await request.get("/api/sonnely/v1/models")).json();
  expect(spec.components.schemas.CompletionRequest.properties.model.enum).toEqual(
    modelList.data.map((item: { id: string }) => item.id),
  );
});

test("workspace setup accepts terms, saves a name and offers optional funding on mobile", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-12-01T12:00:00Z"));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = {
    wallet: fixtureWallet,
    balance: 0,
    name: "",
    onboarding: "pending",
  };
  let termsRequired = true;
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        profile,
        termsRequired,
        enabled: true,
        billingEnabled: !termsRequired,
        cluster: "mainnet",
      },
    }),
  );
  await page.route("**/api/sonnely/accept-terms", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ accepted: true });
    termsRequired = false;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/sonnely/profile", (route) => {
    profile.name = route.request().postDataJSON().name;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/sonnely/finish-onboarding", (route) => {
    profile.onboarding = route.request().postDataJSON().funding;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/sonnely/history", (route) => route.fulfill({ json: [] }));
  await page.goto("/console");
  const setup = page.getByRole("dialog");
  await expect(setup.getByRole("heading", { name: "Review the terms" })).toBeFocused();
  const accept = setup.getByRole("button", { name: "Accept terms" });
  await expect(accept).toBeDisabled();
  await setup.getByRole("checkbox").check();
  await accept.click();
  await setup.getByRole("textbox", { name: /Display name/ }).fill("River");
  const theme = setup.getByRole("switch", { name: "Switch color theme" });
  const scene = setup.locator("aside");
  await expect(theme).toHaveAttribute("aria-checked", "false");
  await expect(scene).toHaveCSS("background-image", /winter-night\.webp/);
  await theme.click();
  await expect(theme).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".console")).toHaveAttribute("data-theme", "light");
  await expect(scene).toHaveCSS("background-image", /winter-day\.webp/);
  await expect(scene).toHaveCSS("color", "rgb(23, 40, 88)");
  await expect(setup.getByRole("textbox", { name: /Display name/ })).toHaveValue("River");
  await theme.click();
  await expect(page.locator(".console")).toHaveAttribute("data-theme", "dark");
  await expect(scene).toHaveCSS("color", "rgb(255, 243, 241)");
  await setup.getByRole("button", { name: "Continue" }).click();
  await expect(setup.getByRole("heading", { name: "Add your first credits" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await setup.getByRole("button", { name: "Explore first" }).click();
  await setup.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(setup.getByText("See tokens, charges, and request references.")).toBeVisible();
  await setup.getByRole("button", { name: "Back" }).click();
  await setup.getByRole("button", { name: "Add credits" }).click();
  await expect(page).toHaveURL(/\/console\/billing#buy-credits$/);
  await expect(setup).toBeHidden();
  expect(profile).toMatchObject({ name: "River", onboarding: "fund" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Buy credits" })).toBeVisible();
  await expect(setup).toBeHidden();
});
