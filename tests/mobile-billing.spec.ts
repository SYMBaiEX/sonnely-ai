import { fixtureWallet } from "./fixtures/wallets";
import { test, expect, devices } from "@playwright/test";
import {
  address,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";

test.use({ ...devices["Pixel 7"], defaultBrowserType: "chromium" });

const wallet = fixtureWallet;
const reference = "11111111111111111111111111111113";
const firstReference = "11111111111111111111111111111112";

test("Android Chrome discovers the Solana mobile wallet and fits the billing page", async ({ page }) => {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({ json: { profile: null, enabled: true, cluster: "mainnet" } }),
  );
  await page.goto("/console/billing");
  await expect(page.getByText("Confidential USDC", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Solana mobile wallet" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
});

test("checkout explains insufficient USDC and confirms a smaller transfer", async ({ page }) => {
  let signed = false;
  let credited = false;
  let checkedSignature = false;
  let registryReads = 0;
  const finality = Promise.withResolvers<void>();
  const signatureBytes = new Uint8Array(64).fill(17);
  const expectedSignature = getBase58Decoder().decode(signatureBytes);
  const payer = address(wallet);
  const message = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: blockhash(reference), lastValidBlockHeight: 100n },
    setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 1 })),
  );
  const transaction = getBase64EncodedWireTransaction(compileTransaction(message));
  await page.exposeFunction("sendFixturePayment", (wire: number[]) => {
    const prepared = getTransactionDecoder().decode(Uint8Array.from(wire));
    const compiled = getCompiledTransactionMessageDecoder().decode(prepared.messageBytes);
    expect(compiled.version).toBe(1);
    expect(compiled.staticAccounts[0]).toBe(wallet);
    signed = true;
    return [...signatureBytes];
  });
  await page.addInitScript(({ address, bytes }) => {
    const chain = "solana:mainnet";
    const account = {
      address,
      publicKey: Uint8Array.from(bytes),
      chains: [chain],
      features: ["solana:signAndSendTransaction"],
    };
    let accounts: typeof account[] = [];
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent).detail.register({
        version: "1.0.0",
        name: "Payment fixture",
        icon: "data:image/png;base64,",
        chains: [chain],
        get accounts() {
          return accounts;
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              accounts = [account];
              return { accounts };
            },
          },
          "solana:signAndSendTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: [0, 1],
            signAndSendTransaction: async (input: { chain: string; transaction: Uint8Array }) => {
              if (input.chain !== chain) throw new Error("Invalid fixture network");
              const send = (window as typeof window & { sendFixturePayment: (wire: number[]) => Promise<number[]> })
                .sendFixturePayment;
              return [{ signature: Uint8Array.from(await send([...input.transaction])) }];
            },
          },
        },
      });
    });
  }, { address: wallet, bytes: [...getAddressEncoder().encode(payer)] });
  await page.route("**/api/sonnely/*", async (route) => {
    const task = new URL(route.request().url()).pathname.split("/").at(-1);
    switch (task) {
      case "session":
        return route.fulfill({
          json: {
            profile: { wallet, name: "Pilot", role: "admin", balance: credited ? 100_000 : 0, referral: "fixture" },
            enabled: true,
            billingEnabled: true,
            paymentVerificationEnabled: true,
            cluster: "mainnet",
          },
        });
      case "history":
        return route.fulfill({ json: [] });
      case "billing-privacy-rings":
        expect(route.request().method()).toBe("GET");
        if (++registryReads === 1) return route.fulfill({ status: 503, json: { error: "RPC unavailable" } });
        return route.fulfill({ json: { cluster: "mainnet", treasuryRegistered: true, walletRegistered: false } });
      case "deposit": {
        const { dollars } = route.request().postDataJSON();
        expect(["5", "0.10"]).toContain(dollars);
        return route.fulfill({
          json: {
            amount: dollars === "5" ? 5_000_000 : 100_000,
            reference: dollars === "5" ? firstReference : reference,
            cluster: "mainnet",
            uri: "solana:fixture",
            qr: "data:image/png;base64,",
          },
        });
      }
      case "payment-transaction":
        if (route.request().postDataJSON().reference === firstReference)
          return route.fulfill({
            status: 400,
            json: { error: "Your wallet needs 5.00 USDC on this Solana network for this transfer." },
          });
        expect(route.request().postDataJSON()).toEqual({ reference, version: 1 });
        return route.fulfill({ json: { transaction } });
      case "confirm": {
        const confirmation = route.request().postDataJSON();
        if (confirmation.reference === firstReference)
          return route.fulfill({ json: { ok: false, cluster: "mainnet" } });
        expect(confirmation.reference).toBe(reference);
        if (confirmation.signature) {
          expect(confirmation.signature).toBe(expectedSignature);
          checkedSignature = true;
          return route.fulfill({ status: 409, json: { error: "Payment has not reached finality." } });
        }
        if (signed && checkedSignature) {
          await finality.promise;
          credited = true;
        }
        return route.fulfill({ json: { ok: credited, cluster: "mainnet" } });
      }
      default:
        return route.continue();
    }
  });
  await page.goto("/console/billing");
  const input = page.getByRole("spinbutton", { name: "Amount in USDC" });
  await expect(input).toHaveValue("5");
  const privacy = page.locator("details").filter({ hasText: "Confidential USDC" });
  const disclosure = privacy.locator("summary");
  await expect(disclosure).toHaveText(/Confidential USDC.*Unavailable/);
  expect(registryReads).toBe(0);
  await disclosure.focus();
  await disclosure.press("Enter");
  await expect(privacy.getByRole("status")).toHaveText("Privacy Rings registration status is unavailable.");
  await privacy.getByRole("button", { name: "Retry registration check" }).press("Enter");
  await expect(disclosure).toBeFocused();
  await expect(privacy.getByText("Registered", { exact: true })).toBeVisible();
  await expect(privacy.getByText("Unregistered", { exact: true })).toBeVisible();
  await expect(privacy.getByText("Connect your signed-in wallet")).toBeVisible();
  expect(signed).toBe(false);
  await expect(privacy.getByRole("button", { name: /pay/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
  await page.getByRole("button", { name: /wallet options/ }).click();
  await page.getByRole("button", { name: "Payment fixture" }).click();
  await expect(privacy.getByText("Payment fixture reports support")).toBeVisible();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Pay $5.00 in USDC" })).toBeFocused();
  const review = page.getByRole("region", { name: "Review transfer" });
  await page.getByRole("button", { name: "Pay with connected wallet" }).click();
  await expect(review.getByRole("alert")).toHaveText(/Your wallet needs 5\.00 USDC/);
  expect(signed).toBe(false);
  await input.fill("0.10");
  await expect(review.getByRole("alert")).toBeHidden();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Pay $0.10 in USDC" })).toBeFocused();
  await page.getByText("Use a Solana Pay link or QR code", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Open in wallet" })).toHaveAttribute("href", "solana:fixture");
  await page.getByRole("button", { name: "Pay with connected wallet" }).click();
  await expect(page.getByText("Payment submitted. Waiting for Solana finality…")).toBeVisible();
  await expect.poll(() => checkedSignature).toBe(true);
  finality.resolve();
  await expect(page.getByRole("status").filter({ hasText: "Payment confirmed. Credits added." })).toBeVisible(
    { timeout: 12_000 },
  );
  await expect(page.locator(".amount")).toHaveText("$0.10");
});

test("an archived payment stays recoverable and cannot be reused for checkout", async ({ page }) => {
  const draft = { reference, amount: 5_000_000, cluster: "mainnet" };
  const signature = getBase58Decoder().decode(new Uint8Array(64).fill(23));
  let archivedAt: number | undefined;
  let finalized = false;
  await page.route("**/api/sonnely/*", async (route) => {
    const url = new URL(route.request().url());
    switch (url.pathname.split("/").at(-1)) {
      case "session":
        return route.fulfill({
          json: {
            profile: { wallet, balance: finalized ? draft.amount : 0 },
            enabled: true,
            billingEnabled: true,
            paymentVerificationEnabled: true,
            cluster: draft.cluster,
          },
        });
      case "history":
        return route.fulfill({
          json: [{ ...draft, time: 1, archivedAt, signature: finalized ? signature : undefined }],
        });
      case "cancel-deposit":
        expect(route.request().postDataJSON()).toEqual({ reference });
        archivedAt = Date.now();
        return route.fulfill({ json: { ok: true } });
      case "payment":
        expect(url.searchParams.get("reference")).toBe(reference);
        expect(archivedAt).toBeDefined();
        return route.fulfill({ json: { ...draft, archivedAt, uri: "", qr: "" } });
      case "deposit":
        expect(route.request().postDataJSON()).toEqual({ dollars: "5" });
        return route.fulfill({
          json: { ...draft, reference: firstReference, uri: "solana:new", qr: "data:image/png;base64," },
        });
      case "confirm": {
        const check = route.request().postDataJSON();
        if (check.reference === reference && check.signature === signature) finalized = true;
        return route.fulfill({ json: { ok: finalized && check.reference === reference, cluster: draft.cluster } });
      }
      default:
        return route.continue();
    }
  });

  await page.goto("/console/billing");
  await page.getByRole("button", { name: "Archive request" }).click();
  const archive = page.getByRole("button", { name: "Confirm archive" });
  await expect(archive).toBeFocused();
  await archive.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Payment request archived." })).toBeVisible();
  const reopen = page.getByRole("button", { name: "Check archived payment" });
  await reopen.click();
  const archived = page.getByRole("region", { name: "Archived payment" });
  await expect(archived.getByRole("heading", { name: "Archived payment" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Pay with connected wallet" })).toHaveCount(0);
  await expect(page.getByText("Use a Solana Pay link or QR code")).toHaveCount(0);

  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Pay $5.00 in USDC" })).toBeFocused();
  await reopen.click();
  await archived.getByRole("textbox", { name: "Transaction signature (optional)" }).fill(signature);
  await archived.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Payment confirmed. Credits added." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finalized" })).toBeVisible();
});

test("mainnet checkout quotes and shows a direct SOL transfer", async ({ page }) => {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: { profile: { wallet, balance: 0 }, enabled: true, billingEnabled: true, cluster: "mainnet" },
    }),
  );
  await page.route("**/api/sonnely/history", (route) =>
    route.fulfill({ json: [{ reference: firstReference, amount: 5_000_000, cluster: "mainnet", time: 1 }] }),
  );
  await page.route("**/api/sonnely/deposit", (route) => {
    expect(route.request().postDataJSON()).toEqual({ dollars: "5", asset: "sol" });
    return route.fulfill({
      json: {
        amount: 5_000_000,
        reference,
        cluster: "mainnet",
        qr: "",
        uri: "solana:" + wallet + "?amount=0.05&reference=" + reference,
        sol: { lamports: 50_000_000, priceUsd: "100", expiresAt: Date.now() + 300_000 },
      },
    });
  });
  await page.goto("/console/billing");
  await expect(page.getByRole("heading", { name: "Buy credits" })).toBeVisible();
  const method = page.getByRole("group", { name: "Payment method" });
  test.skip(!(await method.count()), "SOL funding is disabled in this test deployment.");
  const usdc = method.getByRole("button", { name: "USDC", exact: true });
  const sol = method.getByRole("button", { name: "SOL", exact: true });
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expect(usdc).toHaveAttribute("aria-pressed", "true");
  await sol.press("Enter");
  await expect(sol).toHaveAttribute("aria-pressed", "true");
  await expect(usdc).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("spinbutton", { name: "Credits in USD" })).toHaveValue("5");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Pay 0.05 SOL" })).toBeFocused();
  await expect(page.getByText(/\$5.00 in credits at \$100 per SOL/)).toBeVisible();
  await page.getByText("Use a Solana Pay link or QR code").click();
  const uri = await page.getByRole("link", { name: "Open in wallet" }).getAttribute("href");
  expect(new URL(uri!).searchParams.has("spl-token")).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
});
