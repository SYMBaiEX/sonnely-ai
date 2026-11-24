import { expect, test } from "@playwright/test";
import { fixtureWallet, localFixtureWallets } from "./fixtures/wallets";

test("Privacy Rings is an admin area with a read-only registry check", async ({ page }) => {
  const { treasury } = localFixtureWallets();
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        cluster: "mainnet",
        profile: { wallet: fixtureWallet, role: "admin", name: "", balance: 0, onboarding: "later" },
      },
    }),
  );
  await page.route("**/api/sonnely/admin", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/sonnely/admin-crm?*", (route) => route.fulfill({ json: {} }));
  let reads = 0;
  await page.route("**/api/sonnely/admin-privacy-rings", (route) => {
    expect(route.request().method()).toBe("GET");
    reads++;
    return route.fulfill({ json: { cluster: "mainnet", treasury, registered: false, canPrepare: true } });
  });
  await page.goto("/console/admin/privacy-rings");
  await expect(page.getByRole("heading", { name: "Privacy Rings", exact: true })).toBeVisible();
  await expect(page.getByText(treasury, { exact: true })).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(0);
});

test("unauthenticated requests cannot read or prepare Privacy Ring registration", async ({ request, baseURL }) => {
  expect((await request.get("/api/sonnely/admin-privacy-rings")).status()).toBe(401);
  expect((await request.post("/api/sonnely/admin-privacy-rings", {
    headers: { origin: new URL(baseURL!).origin },
    data: {},
  })).status()).toBe(401);
});

test("finalized registry information is visible after reopening Admin", async ({ page }) => {
  const { treasury, profit: registryAddress } = localFixtureWallets();
  await page.route("**/api/sonnely/session", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        cluster: "mainnet",
        profile: { wallet: fixtureWallet, role: "admin", name: "", balance: 0, onboarding: "later" },
      },
    }),
  );
  await page.route("**/api/sonnely/admin", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/sonnely/admin-crm?*", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/sonnely/admin-privacy-rings", (route) =>
    route.fulfill({ json: { cluster: "mainnet", treasury, registered: true, canPrepare: false, registryAddress } }),
  );
  await page.goto("/console/admin/privacy-rings");
  await expect(page.getByText("Registered", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="https://explorer.solana.com/address/${registryAddress}"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveCount(0);
});
