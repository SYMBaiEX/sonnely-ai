import { localFixtureWallets } from "./fixtures/wallets";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execute = promisify(execFile);

test("the operators directory reflects env roles and named ticket assignment checks operator roles", async ({
  baseURL,
}) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");
  const { backend, hash } = await import("../lib/server");
  const { api } = await import("../convex/_generated/api");
  const { db, secret } = backend();
  const run = async (...args: string[]) =>
    (
      await execute("pnpm", ["--silent", "exec", "convex", ...args], {
        env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
      })
    ).stdout;

  const adminWallet = localFixtureWallets().admin;
  const supportWallet = "fixture-support-" + randomUUID();
  const financeWallet = "fixture-finance-" + randomUUID();
  const memberWallet = "fixture-member-" + randomUUID();
  const envNames = ["SONNELY_SUPPORT_WALLETS", "SONNELY_FINANCE_WALLETS"] as const;
  const previous: Partial<Record<(typeof envNames)[number], string>> = {};
  for (const name of envNames) {
    try {
      const value = (await run("env", "get", name)).trim();
      if (value) previous[name] = value;
    } catch {
      // unset on the local deployment
    }
  }

  async function signIn(wallet: string) {
    const token = randomUUID();
    const auth = { secret, session: hash(token) };
    await db.mutation(api.sonnely.signIn, {
      ...auth,
      wallet,
      nonce: randomUUID(),
      referral: randomUUID(),
      expires: Date.now() + 60_000,
    });
    return { token, auth };
  }

  try {
    await run("env", "set", "SONNELY_SUPPORT_WALLETS", supportWallet);
    await run("env", "set", "SONNELY_FINANCE_WALLETS", financeWallet);
    const admin = await signIn(adminWallet);
    const support = await signIn(supportWallet);
    const member = await signIn(memberWallet);

    await expect(db.query(api.operators.directory, member.auth)).rejects.toThrow(
      "Administrator access required",
    );
    await expect(db.query(api.operators.operators, member.auth)).rejects.toThrow(
      "Administrator access required",
    );

    const directory = await db.query(api.operators.directory, admin.auth);
    const roles = directory.map((row) => row.role);
    expect([...roles].sort()).toEqual(roles);
    const rows = Object.fromEntries(directory.map((row) => [row.wallet, row]));
    expect(rows[adminWallet]).toMatchObject({ role: "admin", openTickets: 0, openTasks: 0 });
    expect(rows[supportWallet]).toMatchObject({ role: "support" });
    expect(rows[financeWallet]).toMatchObject({ role: "finance", openTickets: 0, openTasks: 0 });
    expect(rows[memberWallet]).toBeUndefined();
    const adminAccount = rows[adminWallet].id;
    const supportAccount = rows[supportWallet].id;
    expect(adminAccount).toBeTruthy();
    expect(supportAccount).toBeTruthy();
    expect(rows[financeWallet].id).toBeUndefined();

    const light = await db.query(api.operators.operators, support.auth);
    expect(light).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ wallet: adminWallet, role: "admin", id: adminAccount }),
        expect.objectContaining({ wallet: financeWallet, role: "finance", id: undefined }),
      ]),
    );

    const ticket = await db.mutation(api.sonnely.ticket, {
      ...member.auth,
      email: "fixture@example.com",
      topic: "Operators fixture " + randomUUID(),
      message: "Verify that named assignment respects operator roles.",
    });
    const paging = { cursor: null, numItems: 30 };
    await db.mutation(api.crm.updateTicket, {
      ...admin.auth,
      id: ticket,
      state: "in_progress",
      assignment: "assign",
      assignTo: supportAccount!,
    });
    const assigned = await db.query(api.crm.tickets, { ...admin.auth, state: "in_progress", page: paging });
    expect(assigned.page).toMatchObject([{ id: ticket, assignedWallet: supportWallet }]);
    expect(
      (await db.query(api.operators.directory, admin.auth)).find((row) => row.wallet === supportWallet)
        ?.openTickets,
    ).toBe(1);

    await expect(
      db.mutation(api.crm.updateTicket, {
        ...admin.auth,
        id: ticket,
        state: "in_progress",
        assignment: "assign",
      }),
    ).rejects.toThrow("Choose an operator");
    const memberAccount = assigned.page[0].account;
    await expect(
      db.mutation(api.crm.updateTicket, {
        ...admin.auth,
        id: ticket,
        state: "in_progress",
        assignment: "assign",
        assignTo: memberAccount,
      }),
    ).rejects.toThrow("admin or support operators");
  } finally {
    for (const name of envNames) {
      try {
        if (previous[name] !== undefined) await run("env", "set", name, previous[name]);
        else await run("env", "remove", name);
      } catch {
        // best-effort restore on the local deployment
      }
    }
  }
});
