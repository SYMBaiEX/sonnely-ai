import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Crm from "../gen/app__admin__crm.effect.vibe";
import * as Referrals from "../gen/app__admin__referrals.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Session from "../gen/app__session.effect.vibe";
import { adminApi } from "../src/api/admin.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const operator = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const account = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const token = "admin-api-test-session";
const cleanups: Array<() => void | Promise<void>> = [];

function stateLayer(dir: string) {
  return Layer.provideMerge(
    Layer.mergeAll(
      Admin.stored("admin"),
      Crm.stored("admin-crm"),
      Referrals.stored("admin-referrals"),
      Ledger.stored("billing-ledger"),
      Session.stored("session"),
    ),
    store(dir),
  );
}

function writeSession(dir: string) {
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [{
      digest: sessionDigest(token),
      nonce: "nonce",
      wallet: operator,
      createdAt: 1,
      expiresAt: Date.now() + 60_000,
      state: "LoginActive",
    }],
  }));
}

function makeAdminApi() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-admin-api-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeSession(dir);
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const appLayer = Layer.provideMerge(adminApi, stateLayer(dir)).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return { handler: app.handler, dir };
}

function post(handler: (request: Request) => Promise<Response>, path: string, body: unknown, cookie = true) {
  return handler(new Request("http://localhost" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: "sonnely_session=" + token } : {}),
    },
    body: JSON.stringify(body),
  }));
}

async function grantOperator(handler: (request: Request) => Promise<Response>) {
  const response = await post(handler, "/api/machines/admin", { type: "grant", wallet: operator, role: "Admin", at: 1 });
  if (!response.ok) throw new Error("operator grant failed: " + response.status);
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("admin API", () => {
  // spec/app/admin/operators.md, "Only an operator can grant access": the deployment
  // environment names the first operators, each role through its own variable
  it("bootstraps the role-specific operator wallets from the deployment environment", async () => {
    const support = "4vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2d";
    const finance = "7vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2e";
    const legacy = "8vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2f";
    const saved = {
      SONNELY_ADMIN_WALLETS: process.env.SONNELY_ADMIN_WALLETS,
      SONNELY_SUPPORT_WALLETS: process.env.SONNELY_SUPPORT_WALLETS,
      SONNELY_FINANCE_WALLETS: process.env.SONNELY_FINANCE_WALLETS,
      SONNELY_OPERATORS: process.env.SONNELY_OPERATORS,
    };
    process.env.SONNELY_ADMIN_WALLETS = operator + ", " + account;
    process.env.SONNELY_SUPPORT_WALLETS = support;
    process.env.SONNELY_FINANCE_WALLETS = finance;
    process.env.SONNELY_OPERATORS = legacy;
    try {
      const { handler } = makeAdminApi();
      const response = await handler(new Request("http://localhost/api/machines/admin", { headers: { cookie: "sonnely_session=" + token } }));
      const body = await response.json() as Admin.Registry;
      expect({ status: response.status, roster: body.ops.roster }).toEqual({
        status: 200,
        roster: [
          { wallet: operator, role: "Admin" },
          { wallet: account, role: "Admin" },
          { wallet: legacy, role: "Admin" },
          { wallet: support, role: "Support" },
          { wallet: finance, role: "Finance" },
        ],
      });
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  // spec/app/admin/index.md, "What the admin reads elsewhere"
  it("joins the keys and billing states the machines persist", async () => {
    const { handler, dir } = makeAdminApi();
    writeFileSync(join(dir, "workspace-keys"), JSON.stringify({ keys: [] }));
    writeFileSync(join(dir, "billing-ledger"), JSON.stringify({ balance: 0, entries: [] }));
    await grantOperator(handler);
    const response = await handler(new Request("http://localhost/api/admin/overview", { headers: { cookie: "sonnely_session=" + token } }));
    const body = await response.json() as Record<string, unknown>;
    expect({ status: response.status, keys: body.keys, billing: body.billing }).toEqual({
      status: 200,
      keys: { keys: [] },
      billing: { balance: 0, entries: [] },
    });
  });

  // spec/app/billing/ledger.md, "Story: Adjust a balance"
  // spec/app/admin/crm.md, "A balance adjustment is recorded without overdrawing the balance read"
  it("treats a repeated adjustment request as the same audited write", async () => {
    const { handler, dir } = makeAdminApi();
    await grantOperator(handler);
    const adjustment = {
      id: "adjustment-repeat",
      activityId: "activity-repeat",
      account,
      delta: 5_000,
      reason: "goodwill credit for the outage",
    };
    const first = await post(handler, "/api/admin/adjust", adjustment);
    const second = await post(handler, "/api/admin/adjust", adjustment);
    const distinct = await post(handler, "/api/admin/adjust", { ...adjustment, id: "adjustment-repeat-2", activityId: "activity-repeat-2" });
    const crmResponse = await handler(new Request("http://localhost/api/machines/admin-crm", { headers: { cookie: "sonnely_session=" + token } }));
    const ledger = (existsSync(join(dir, "billing-ledger")) ? JSON.parse(readFileSync(join(dir, "billing-ledger"), "utf8")) : Ledger.initial) as Ledger.Ledger;
    const crm = await crmResponse.json() as Crm.Crm;
    expect({
      statuses: [first.status, second.status, distinct.status],
      ledgerAdjustments: ledger.entries.filter((entry) => entry.detail.startsWith("adjustment-repeat")),
      crmAdjustments: crm.adjustments.filter((row) => row.id.startsWith("adjustment-repeat")),
      crmActivities: crm.activities.filter((row) => row.kind === "adjust"),
    }).toEqual({
      statuses: [200, 200, 200],
      ledgerAdjustments: [
        { wallet: account, kind: "AdjustCredit", detail: adjustment.id, amount: 5_000 },
        { wallet: account, kind: "AdjustCredit", detail: "adjustment-repeat-2", amount: 5_000 },
      ],
      crmAdjustments: [
        expect.objectContaining({ id: adjustment.id, account, delta: 5_000 }),
        expect.objectContaining({ id: "adjustment-repeat-2", account, delta: 5_000 }),
      ],
      crmActivities: [
        expect.objectContaining({ account, kind: "adjust" }),
        expect.objectContaining({ account, kind: "adjust" }),
      ],
    });
  });

  // spec/app/billing/ledger.md, "An adjustment credits or debits once per record"
  it("does not move credit when the audited record cannot be written", async () => {
    const { handler, dir } = makeAdminApi();
    await grantOperator(handler);
    const collision = "adjustment-conflict";
    const note = await post(handler, "/api/machines/admin-crm", {
      type: "addNote",
      id: collision,
      account,
      actor: operator,
      note: "existing customer timeline row",
      now: 1,
    });
    const adjusted = await post(handler, "/api/admin/adjust", {
      id: collision,
      activityId: collision,
      account,
      delta: 5_000,
      reason: "goodwill credit for the outage",
    });
    const ledger = (existsSync(join(dir, "billing-ledger")) ? JSON.parse(readFileSync(join(dir, "billing-ledger"), "utf8")) : Ledger.initial) as Ledger.Ledger;
    expect({ noteStatus: note.status, adjustStatus: adjusted.status, entries: ledger.entries }).toEqual({
      noteStatus: 200,
      adjustStatus: 409,
      entries: [],
    });
  });
});
