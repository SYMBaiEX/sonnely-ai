import { expect, test } from "@playwright/test";
import { confidentialUsdcMint, type ConfidentialPayment } from "../lib/confidential-payment-types";
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

test("confidential payment review requires explicit treasury verification and blocks known mismatches", async ({
  page,
}) => {
  const { treasury, profit } = localFixtureWallets();
  const now = Date.now();
  const payment: ConfidentialPayment = {
    reference: profit,
    payer: fixtureWallet,
    treasury,
    cluster: "mainnet",
    mint: confidentialUsdcMint,
    amount: 10_000,
    status: "under_review",
    signature: "1".repeat(64),
    slot: 1234,
    blockTime: Math.floor(now / 1000),
    createdAt: now - 30_000,
    submittedAt: now,
    expiresAt: now + 60_000,
    reviewReason: "details-encrypted",
  };
  const mismatch: ConfidentialPayment = {
    ...payment,
    reference: treasury,
    amount: 40_001,
    signature: "2".repeat(64),
    reviewReason: "asset-mismatch",
  };
  let payments = [payment, mismatch];
  const decisions: unknown[] = [];
  await page.setViewportSize({ width: 375, height: 800 });
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
    route.fulfill({ json: { cluster: "mainnet", treasury, registered: true, canPrepare: false } }),
  );
  await page.route("**/api/sonnely/confidential-payments/review*", (route) => {
    if (route.request().method() === "GET") {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      return route.fulfill({
        json: cursor
          ? { payments: payments.slice(1), nextCursor: null }
          : { payments: payments.slice(0, 1), nextCursor: payments.length > 1 ? "second page" : null },
      });
    }
    const decision = route.request().postDataJSON();
    decisions.push(decision);
    const selected = payments.find((row) => row.reference === decision.reference);
    payments = payments.filter((row) => row.reference !== decision.reference);
    return route.fulfill({
      json: { ...selected, status: decision.action === "approve" ? "credited" : "rejected" },
    });
  });

  await page.goto("/console/admin/privacy-rings");
  const reviews = page.getByRole("region", { name: "Confidential payment reviews" });
  const reviewHeading = reviews.getByRole("heading", { name: "Confidential payment reviews" });
  const first = reviews.getByRole("article").filter({ hasText: "0.01 USDC" });
  await expect(first.getByText(treasury, { exact: true })).toBeVisible();
  await expect(first.getByText(fixtureWallet, { exact: true })).toBeVisible();
  await expect(first.getByText("Finalized on Solana", { exact: true })).toBeVisible();
  await expect(first.getByRole("link", { name: "Solana Explorer" })).toHaveAttribute(
    "href",
    `https://explorer.solana.com/tx/${payment.signature}`,
  );
  await expect(first.getByRole("button", { name: "Copy signature" })).toBeVisible();
  await reviews.getByRole("button", { name: "Load more payments" }).click();
  const second = reviews.getByRole("article").filter({ hasText: "0.040001 USDC" });
  await expect(second).toBeVisible();
  await expect.poll(() => reviews.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);

  const open = first.getByRole("button", { name: "Review payment" });
  await open.click();
  await expect(first.getByRole("heading", { name: "Review 0.01 USDC payment" })).toBeFocused();
  await first.getByRole("button", { name: "Cancel review" }).click();
  await expect(open).toBeFocused();
  await open.press("Enter");
  const approve = first.getByRole("button", { name: "Credit $0.01" });
  await expect(approve).toBeDisabled();
  await first.getByRole("checkbox", { name: /matched this finalized transaction signature/i }).check();
  await approve.click();
  await expect(reviews.getByText("$0.01 credited.", { exact: true })).toBeVisible();
  await expect(reviewHeading).toBeFocused();
  expect(decisions).toEqual([{ reference: payment.reference, action: "approve", confirmedReceipt: true }]);

  await second.getByRole("button", { name: "Review payment" }).click();
  await expect(second.getByRole("radio", { name: "Approve and credit" })).toBeDisabled();
  const reject = second.getByRole("button", { name: "Reject payment" });
  await expect(reject).toBeDisabled();
  await second
    .getByRole("textbox", { name: "Rejection reason" })
    .fill("The transfer used a different asset.");
  await reject.click();
  await expect(reviews.getByText("Payment rejected.", { exact: true })).toBeVisible();
  await expect(reviews.getByText("No payments awaiting review", { exact: true })).toBeVisible();
  expect(decisions[1]).toEqual({
    reference: mismatch.reference,
    action: "reject",
    reason: "The transfer used a different asset.",
  });
});
