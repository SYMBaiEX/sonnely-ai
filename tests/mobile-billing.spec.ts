import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["Pixel 7"], defaultBrowserType: "chromium" });

const wallet = "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk";
const reference = "11111111111111111111111111111113";

test("Android Chrome discovers the Solana mobile wallet and fits the billing page", async ({ page }) => {
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({ json: { profile: null, enabled: true, cluster: "mainnet" } }),
  );
  await page.goto("/console/billing");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Solana mobile wallet" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);
});

test("the $5 checkout approves a prepared transfer and refreshes after automatic confirmation", async ({
  page,
}) => {
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
            profile: { wallet, name: "Pilot", balance: credited ? 5_000_000 : 0, referral: "fixture" },
            enabled: true,
            billingEnabled: true,
            paymentVerificationEnabled: true,
            cluster: "mainnet",
          },
        });
      case "history":
        return route.fulfill({ json: [] });
      case "deposit":
        expect(route.request().postDataJSON()).toEqual({ dollars: 5 });
        return route.fulfill({
          json: {
            amount: 5_000_000,
            reference,
            cluster: "mainnet",
            uri: "solana:fixture",
            qr: "data:image/png;base64,",
          },
        });
      case "payment-transaction":
        expect(route.request().postDataJSON()).toEqual({ reference, version: "legacy" });
        return route.fulfill({ json: { transaction: "AQ==" } });
      case "confirm":
        expect(route.request().postDataJSON()).toEqual({ reference });
        credited = signed;
        return route.fulfill({ json: { ok: credited, cluster: "mainnet" } });
      default:
        return route.continue();
    }
  });
  await page.goto("/console/billing");
  await expect(page.getByRole("spinbutton", { name: "Amount in USDC" })).toHaveValue("5");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Pay $5.00 in USDC" })).toBeVisible();
  await page.getByText("Use a Solana Pay link or QR code", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Open in wallet" })).toHaveAttribute("href", "solana:fixture");
  await page.getByRole("button", { name: "Pay with connected wallet" }).click();
  await expect(page.getByText("Payment submitted. Waiting for Solana finality…")).toBeVisible();
  await expect(page.getByText("Payment confirmed. Credits added.")).toBeVisible({ timeout: 12_000 });
  await expect(page.locator(".amount")).toHaveText("$5.00");
});
