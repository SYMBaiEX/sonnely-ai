import { localFixtureWallets } from "./fixtures/wallets";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("admin actions are recorded in an audit trail the Logs tab renders", async ({ baseURL, page }) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  const { db, secret } = backend();
  const adminWallet = localFixtureWallets().admin;

  async function signIn(wallet: string) {
    const token = randomUUID();
    const auth = { secret, session: hash(token) };
    await db.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomUUID(),
      expires: Date.now() + 60_000,
      referral: randomUUID().replaceAll("-", "").slice(0, 16),
    });
    return { auth, token };
  }

  const admin = await signIn(adminWallet);
  const guestWallet = randomUUID();
  const guest = await signIn(guestWallet);
  const paging = { cursor: null, numItems: 30 };
  const trail = (auth: typeof admin.auth, filters = {}) =>
    db.query(api.audit.auditTrail, { ...auth, ...filters, page: paging });

  await expect(trail(guest.auth)).rejects.toThrow("Administrator access required");

  const account = (await db.query(api.crm.customers, { ...admin.auth, search: guestWallet, page: paging }))
    .page[0].id;
  await db.mutation(api.crm.addNote, { ...admin.auth, account, note: "Audit fixture note." });

  expect((await trail(admin.auth)).page).toContainEqual(
    expect.objectContaining({
      actor: adminWallet,
      action: "crm.note",
      targetKind: "account",
      targetId: account,
      summary: "Note added to " + guestWallet,
    }),
  );
  const byAction = await trail(admin.auth, { action: "crm.note", actor: adminWallet });
  expect(byAction.page.length).toBeGreaterThan(0);
  expect(byAction.page.every((row) => row.action === "crm.note" && row.actor === adminWallet)).toBe(true);
  expect((await trail(admin.auth, { actor: guestWallet })).page).toEqual([]);

  await page.context().addCookies([{ name: "sonnely_session", value: admin.token, url: baseURL! }]);
  await page.goto("/console/billing");
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Admin", exact: true })
    .click();
  const adminNav = page.getByRole("navigation", { name: "Admin workspace" });
  await adminNav.getByRole("button", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText("crm.note", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Note added to " + guestWallet, { exact: true })).toBeVisible();
});
