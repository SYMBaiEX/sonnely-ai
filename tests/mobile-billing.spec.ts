import { fixtureWallet } from "./fixtures/wallets";
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["Pixel 7"], defaultBrowserType: "chromium" });

const wallet = fixtureWallet;
const reference = "11111111111111111111111111111113";
const firstReference = "11111111111111111111111111111112";

test("Android Chrome discovers the Solana mobile wallet and fits the billing page", async ({ page }) => {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({ json: { profile: null, enabled: true, cluster: "mainnet" } }),
  );
  await page.goto("/console/billing");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Solana mobile wallet" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
});

test("checkout explains insufficient USDC and confirms a smaller transfer", async ({ page }) => {
  let signed = false;
  let credited = false;
  await page.exposeFunction("sendFixturePayment", () => {
    signed = true;
    return Array(64).fill(17);
  });
  await page.addInitScript((address) => {
    const chain = "solana:mainnet";
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent).detail.register({
        version: "1.0.0",
        name: "Payment fixture",
        icon: "data:image/png;base64,",
        chains: [chain],
        accounts: [
          {
            address,
            publicKey: new Uint8Array(32),
            chains: [chain],
            features: ["solana:signAndSendTransaction"],
          },
        ],
        features: {
          "solana:signAndSendTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy"],
            signAndSendTransaction: async (input: { chain: string; transaction: Uint8Array }) => {
              if (input.chain !== chain || input.transaction[0] !== 1)
                throw new Error("Invalid fixture transfer");
              const send = (window as typeof window & { sendFixturePayment: () => Promise<number[]> })
                .sendFixturePayment;
              return [{ signature: Uint8Array.from(await send()) }];
            },
          },
        },
      });
    });
  }, wallet);
  await page.route("**/api/sonnely/*", async (route) => {
    const task = new URL(route.request().url()).pathname.split("/").at(-1);
    switch (task) {
      case "session":
        return route.fulfill({
          json: {
            profile: { wallet, name: "Pilot", balance: credited ? 100_000 : 0, referral: "fixture" },
            enabled: true,
            billingEnabled: true,
            paymentVerificationEnabled: true,
            cluster: "mainnet",
          },
        });
      case "history":
        return route.fulfill({ json: [] });
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
        expect(route.request().postDataJSON()).toEqual({ reference, version: "legacy" });
        return route.fulfill({ json: { transaction: "AQ==" } });
      case "confirm":
        if (route.request().postDataJSON().reference === firstReference)
          return route.fulfill({ json: { ok: false, cluster: "mainnet" } });
        expect(route.request().postDataJSON()).toEqual({ reference });
        credited = signed;
        return route.fulfill({ json: { ok: credited, cluster: "mainnet" } });
      default:
        return route.continue();
    }
  });
  await page.goto("/console/billing");
  const input = page.getByRole("spinbutton", { name: "Amount in USDC" });
  await expect(input).toHaveValue("5");
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
  await expect(page.getByRole("status").filter({ hasText: "Payment confirmed. Credits added." })).toBeVisible(
    { timeout: 12_000 },
  );
  await expect(page.locator(".amount")).toHaveText("$0.10");
});
