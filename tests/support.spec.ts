import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("two-way support threads keep internal replies private and reopen resolved requests", async ({
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
  const customer = await signIn(randomUUID());
  const other = await signIn(randomUUID());
  const paging = { cursor: null, numItems: 30 };

  const topic = "Support fixture " + randomUUID().slice(0, 8);
  const ticket = await db.mutation(api.support.openTicket, {
    ...customer.auth,
    email: "fixture@example.com",
    topic,
    message: "Need help with a stuck request.",
  });
  expect((await request.get("/api/sonnely/support-tickets")).status()).toBe(401);

  await db.mutation(api.crm.replyTicket, {
    ...admin.auth,
    id: ticket,
    body: "We are looking into it.",
    visibility: "public",
  });
  await db.mutation(api.crm.replyTicket, {
    ...admin.auth,
    id: ticket,
    body: "Internal suspicion: provider issue.",
    visibility: "internal",
  });
  const adminThread = await db.query(api.crm.ticketThread, { ...admin.auth, id: ticket });
  expect(adminThread).toMatchObject({ state: "in_progress", replyCount: 2 });
  expect(adminThread?.replies).toMatchObject([
    { visibility: "internal", author: adminWallet },
    { visibility: "public", author: adminWallet },
  ]);

  const customerThread = await db.query(api.support.myThread, { ...customer.auth, id: ticket });
  expect(customerThread?.replies).toMatchObject([{ mine: false, body: "We are looking into it." }]);
  expect(customerThread?.replies.some((item) => item.body.includes("Internal suspicion"))).toBe(false);
  const mine = await db.query(api.support.myTickets, { ...customer.auth, page: paging });
  expect(mine.page).toMatchObject([
    { id: ticket, state: "in_progress", replyCount: 1, hasPublicReply: true },
  ]);

  await expect(db.query(api.support.myThread, { ...other.auth, id: ticket })).rejects.toThrow(
    "Support request unavailable",
  );
  await expect(
    db.mutation(api.support.customerReply, { ...other.auth, id: ticket, body: "Cross-account" }),
  ).rejects.toThrow("Support request unavailable");
  await expect(
    db.mutation(api.crm.replyTicket, {
      ...other.auth,
      id: ticket,
      body: "Denied",
      visibility: "public",
    }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    db.mutation(api.support.customerReply, { ...customer.auth, id: ticket, body: "   " }),
  ).rejects.toThrow("4,000");

  await db.mutation(api.crm.updateTicket, {
    ...admin.auth,
    id: ticket,
    state: "resolved",
    assignment: "keep",
  });
  await db.mutation(api.support.customerReply, {
    ...customer.auth,
    id: ticket,
    body: "Still broken on my side.",
  });
  expect((await db.query(api.support.myThread, { ...customer.auth, id: ticket }))?.state).toBe("open");
  const queue = await db.query(api.crm.tickets, { ...admin.auth, state: "open", page: paging });
  expect(queue.page.map((row) => row.id)).toContain(ticket);

  await page.context().addCookies([{ name: "sonnely_session", value: customer.token, url: baseURL! }]);
  await page.goto("/console/support");
  await expect(page.getByRole("heading", { name: "Support", level: 1 })).toBeVisible();
  await page.getByText(topic, { exact: true }).click();
  await expect(page.getByText("We are looking into it.", { exact: true })).toBeVisible();
  await expect(page.getByText("Still broken on my side.", { exact: true })).toBeVisible();
  expect(await page.getByText("Internal suspicion", { exact: true }).count()).toBe(0);
  await page.getByRole("textbox", { name: "Reply" }).fill("One more detail.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("One more detail.", { exact: true })).toBeVisible();
});
