import { generateKeyPairSync, sign } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import bs58 from "bs58";

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
  await expect(page.getByRole("heading", { name: "Private AI, on your terms." })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Models" })
    .click();
  await page.getByRole("searchbox", { name: "Find a model" }).fill("Qwen");
  await expect(page.getByRole("heading", { name: "Qwen 3.6 35B" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DeepSeek V4.1 Flash" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open in chat" }).click();
  await expect(page.getByRole("combobox", { name: "Inference model" })).toHaveValue(
    "Qwen/Qwen3.6-35B-A3B-FP8",
  );
  await page.getByRole("button", { name: "What is a trusted execution environment?" }).click();
  await expect(page.getByText("Sample transcript")).toBeVisible();
  await page.getByRole("button", { name: "Quick navigation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Usage" }).click();
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
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
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Local fixture");
  await page.getByRole("spinbutton", { name: "Daily cap (USD)" }).fill("5");
  await page.locator("form").getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByRole("region", { name: "New API key" }).locator("code")).toHaveText(
    /^sonnely_live_/,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Local fixture", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Display name" }).fill("Test operator");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");

  await page.getByRole("link", { name: "Referrals", exact: true }).click();
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
  expect((await list.json()).data).toHaveLength(3);
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
