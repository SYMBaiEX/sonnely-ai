import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { termsVersion } from "../lib/policy";
import { models } from "../lib/models";

test("referral milestones and the admin workspace follow actual account activity", async ({
  baseURL,
  page,
  request,
}) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  const { db, secret } = backend();
  const adminWallet = "4mXbaPHhmW9bZMdSAd9NEpdL5q3gjAcEdZyRPYhMUAGk";

  async function signIn(wallet: string, invite?: string) {
    const token = randomUUID();
    const referral = randomUUID().replaceAll("-", "").slice(0, 16);
    const auth = { secret, session: hash(token) };
    await db.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomUUID(),
      expires: Date.now() + 60_000,
      referral,
      invite,
    });
    return { auth, referral, token };
  }

  const admin = await signIn(adminWallet);
  expect((await db.query(api.sonnely.profile, admin.auth))?.role).toBe("admin");
  await db.mutation(api.sonnely.acceptTerms, { ...admin.auth, version: termsVersion });
  await db.mutation(api.sonnely.finishOnboarding, { ...admin.auth, funding: "later" });
  const inviter = await signIn(randomUUID());
  const guest = await signIn(randomUUID(), inviter.referral);
  const username = "tester_" + randomUUID().slice(0, 8);
  await db.mutation(api.sonnely.rename, {
    ...guest.auth,
    name: "Referred customer",
    username: username.toUpperCase(),
  });
  await expect(db.mutation(api.sonnely.rename, { ...inviter.auth, name: "", username })).rejects.toThrow(
    "already taken",
  );
  const paging = { cursor: null, numItems: 30 };
  const referral = () => db.query(api.referralPipeline.list, { ...inviter.auth, paginationOpts: paging });
  expect((await referral()).page).toMatchObject([{ username, funded: false, active: false }]);
  expect((await db.query(api.referralPipeline.list, { ...guest.auth, paginationOpts: paging })).page).toEqual(
    [],
  );

  expect((await request.get("/api/sonnely/admin-crm?view=customers")).status()).toBe(401);
  const customerList = { search: "@" + username, page: paging };
  await expect(db.query(api.crm.customers, { ...guest.auth, ...customerList })).rejects.toThrow(
    "Administrator access required",
  );
  await expect(
    db.query(api.crm.traces, { ...guest.auth, status: "all", search: "", page: paging }),
  ).rejects.toThrow("Administrator access required");
  await expect(db.query(api.crm.tickets, { ...guest.auth, state: "all", page: paging })).rejects.toThrow(
    "Administrator access required",
  );

  const reference = randomUUID();
  await db.mutation(api.sonnely.createDeposit, {
    ...guest.auth,
    reference,
    recipient: adminWallet,
    mint: "test-usdc",
    cluster: "mainnet",
    amount: 1_000_000,
  });
  expect((await referral()).page).toMatchObject([{ funded: false, active: false }]);
  await db.mutation(api.sonnely.confirmDeposit, { ...guest.auth, reference, signature: randomUUID() });
  expect((await referral()).page).toMatchObject([{ funded: true, active: false }]);
  await db.mutation(api.sonnely.acceptTerms, { ...guest.auth, version: termsVersion });
  const id = await db.mutation(api.sonnely.reserve, {
    ...guest.auth,
    model: models[0].id,
    cost: 300,
    requireTerms: true,
  });
  const providerRequest = "crm-fixture-" + randomUUID();
  await db.mutation(api.sonnely.settle, {
    secret,
    id,
    input: 12,
    output: 24,
    cost: 40,
    status: "complete",
    providerRequest,
    providerStatus: 200,
    outcome: "complete",
  });
  expect((await referral()).page).toMatchObject([{ funded: true, active: true }]);

  const topic = "CRM fixture " + username;
  const ticket = await db.mutation(api.sonnely.ticket, {
    ...guest.auth,
    email: "fixture@example.com",
    topic,
    message: "Verify that support owners and statuses are recorded.",
  });
  const result = await db.query(api.crm.customers, { ...admin.auth, ...customerList });
  expect(result.page).toMatchObject([{ username, balance: 999_960 }]);
  const account = result.page[0].id;
  await expect(db.query(api.crm.customer, { ...guest.auth, id: account })).rejects.toThrow(
    "Administrator access required",
  );
  await expect(db.mutation(api.crm.addNote, { ...guest.auth, account, note: "Denied" })).rejects.toThrow(
    "Administrator access required",
  );
  await expect(
    db.mutation(api.crm.updateTicket, { ...guest.auth, id: ticket, state: "resolved", assignment: "claim" }),
  ).rejects.toThrow("Administrator access required");

  const followUp = await db.mutation(api.crmTasks.create, {
    ...admin.auth,
    account,
    title: "Check the first invoice",
    dueAt: Date.now() - 60_000,
  });
  await expect(db.mutation(api.crmTasks.create, { ...guest.auth, account, title: "Denied" })).rejects.toThrow(
    "Administrator access required",
  );
  await expect(db.query(api.crmTasks.listForAccount, { ...guest.auth, account })).rejects.toThrow(
    "Administrator access required",
  );
  expect(await db.query(api.crmTasks.listForAccount, { ...admin.auth, account })).toMatchObject([
    { id: followUp, title: "Check the first invoice", assignee: adminWallet, doneAt: undefined },
  ]);
  expect((await db.query(api.crm.customer, { ...admin.auth, id: account }))?.tasks).toMatchObject([
    { id: followUp, title: "Check the first invoice" },
  ]);
  expect(await db.query(api.crmTasks.mine, { ...admin.auth, openOnly: true })).toMatchObject([
    { id: followUp, account, wallet: expect.any(String) },
  ]);
  await db.mutation(api.crmTasks.complete, { ...admin.auth, id: followUp });
  expect((await db.query(api.crmTasks.listForAccount, { ...admin.auth, account }))[0].doneAt).toEqual(
    expect.any(Number),
  );
  expect(
    (await db.query(api.crmTasks.mine, { ...admin.auth, openOnly: true })).map((row) => row.id),
  ).not.toContain(followUp);
  await db.mutation(api.crmTasks.reopen, { ...admin.auth, id: followUp });
  expect((await db.query(api.crmTasks.mine, { ...admin.auth, openOnly: true }))[0].id).toBe(followUp);

  await page.context().addCookies([{ name: "sonnely_session", value: admin.token, url: baseURL! }]);
  const sessionRequests: string[] = [];
  page.on("request", (entry) => {
    if (new URL(entry.url()).pathname === "/api/sonnely/session") sessionRequests.push(entry.url());
  });
  await page.goto("/console/billing");
  const walletButton = page.getByRole("button", { name: /^8jN1/ });
  await expect(walletButton).toBeVisible();
  const originalWalletButton = await walletButton.elementHandle();
  const workspace = page.getByRole("navigation", { name: "Workspace navigation" });
  for (const label of ["Usage", "Admin"]) {
    await workspace.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: label, exact: true, level: 1 })).toBeVisible();
    expect(await originalWalletButton.evaluate((button) => button.isConnected)).toBe(true);
    await expect(walletButton).toBeVisible();
  }
  expect(sessionRequests).toHaveLength(1);
  const adminNav = page.getByRole("navigation", { name: "Admin workspace" });
  await adminNav.getByRole("button", { name: "Customers" }).click();
  await page.getByRole("searchbox", { name: "Search customers" }).fill("@" + username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: username })
    .getByRole("button", { name: "View account" })
    .click();
  await expect(page.getByText("Paid request completed", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Internal note" }).fill("Checked deposit and paid inference.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Checked deposit and paid inference.", { exact: true })).toBeVisible();
  const pending = page.locator(".crm-record").filter({ hasText: "Check the first invoice" });
  await expect(pending.getByText("Overdue")).toBeVisible();
  await page.getByRole("textbox", { name: "Follow-up" }).fill("Confirm usage receipts");
  await page.getByRole("button", { name: "Add follow-up" }).click();
  const created = page.locator(".crm-record").filter({ hasText: "Confirm usage receipts" });
  await expect(created).toBeVisible();
  await expect(created.getByText("Overdue")).toHaveCount(0);
  await created.getByRole("button", { name: "Done" }).click();
  await expect(created.getByRole("button", { name: "Reopen" })).toBeVisible();

  await adminNav.getByRole("button", { name: "Support", exact: true }).click();
  await page.getByRole("combobox", { name: "Support status" }).selectOption("open");
  await page.getByText(topic, { exact: true }).click();
  const issue = page.locator("details").filter({ hasText: topic });
  await issue.getByRole("combobox", { name: "Status", exact: true }).selectOption("in_progress");
  await issue.getByRole("combobox", { name: "Assignment" }).selectOption("claim");
  await issue.getByRole("button", { name: "Save request" }).click();
  await expect(page.getByText(topic, { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Support status" }).selectOption("in_progress");
  await expect(issue.getByText("In progress", { exact: true }).first()).toBeVisible();
  expect((await db.query(api.crm.customer, { ...admin.auth, id: account }))?.tickets).toMatchObject([
    { id: ticket, state: "in_progress", assignedWallet: adminWallet },
  ]);

  await adminNav.getByRole("button", { name: "Traces" }).click();
  await page.getByRole("searchbox", { name: "Search request traces" }).fill(providerRequest);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".crm-record summary").click();
  await expect(page.getByText(providerRequest, { exact: true })).toBeVisible();
  expect(
    (
      await db.query(api.crm.traces, {
        ...admin.auth,
        status: "complete",
        search: providerRequest,
        page: paging,
      })
    ).page,
  ).toMatchObject([{ id, providerStatus: 200, outcome: "complete", cost: 40, settled: expect.any(Number) }]);

  await adminNav.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Follow-ups due" })).toBeVisible();
  const listed = page.locator(".crm-record").filter({ hasText: "Check the first invoice" });
  await expect(listed.getByText("Overdue")).toBeVisible();
  await listed.getByRole("button", { name: "Open customer" }).click();
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
});
