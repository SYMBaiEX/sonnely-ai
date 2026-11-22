import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/sonnely/[task]/route";
import { api } from "../convex/_generated/api";
import { gatewayRequestId } from "../convex/usageMaxOutbox";
import { backend, hash } from "../lib/server";
import { deliverGatewayReceipts, gatewayEndpoint, type GatewayReceipt } from "../lib/usagemax-gateway";

const writeCredential = "umxg_" + "a".repeat(64);
const reportCredential = "umxg_" + "b".repeat(64);
const execute = promisify(execFile);

test("the delivery client preserves retry payloads and rejects an unsafe local destination", async () => {
  const settledAt = Date.now();
  const receipt: GatewayReceipt = {
    schemaVersion: 1,
    requestId: await gatewayRequestId(randomUUID()),
    revision: 1,
    model: "fixture-model",
    provider: "near-ai",
    status: "ok",
    settledAt,
    currency: "USD",
    customerChargeNanos: 0,
    providerCostNanos: null,
    providerCostBasis: "unknown",
    usage: { inputTokens: 0 },
  };
  const bodies: string[] = [];
  const send: typeof fetch = async (request, init) => {
    expect(String(request)).toBe("https://usagemax.com/api/v1/gateway/receipts");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + writeCredential);
    expect(init?.redirect).toBe("error");
    bodies.push(String(init?.body));
    return bodies.length === 1
      ? new Response(null, { status: 429, headers: { "retry-after": "120" } })
      : Response.json({ results: [{ requestId: receipt.requestId, revision: 1, status: "replay" }] });
  };
  expect((await deliverGatewayReceipts([receipt], writeCredential, send)).retryDelay).toBe(120_000);
  expect((await deliverGatewayReceipts([receipt], writeCredential, send)).results?.size).toBe(1);
  expect(bodies[0]).toBe(bodies[1]);
  expect(gatewayEndpoint("http://127.0.0.1:3212", "bad/remote.invalid")).toBeNull();
  expect(gatewayEndpoint("https://test.convex.cloud", "3212")).toBe(
    "https://usagemax.com/api/v1/gateway/receipts",
  );
});

test("settlement survives a gateway outage, late cost is revised, and reporting requires an administrator", async () => {
  test.skip(process.env.SONNELY_GATEWAY_LOCAL_TEST !== "1", "Opt-in local Convex fixture");
  test.setTimeout(45_000);
  process.loadEnvFile(".env.local");
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CONVEX_URL ?? ""))
    throw new Error("Local Convex required");

  const { db, secret } = backend();
  const run = async (...args: string[]) =>
    (
      await execute("pnpm", ["exec", "convex", ...args], {
        env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
      })
    ).stdout;
  const localSettings = [
    "USAGEMAX_GATEWAY_LOCAL_PORT",
    "USAGEMAX_GATEWAY_INGEST_TOKEN",
    "SONNELY_ADMIN_WALLETS",
  ];
  const configured = (await run("env", "list", "--names-only")).trim().split(/\s+/);
  if (localSettings.some((name) => configured.includes(name)))
    throw new Error("Use a disposable local Convex deployment");
  const fixtureWallet = "fixture-gateway-admin-" + randomUUID();
  let reportCalls = 0;
  let badCredential = false;
  let failing = true;
  let truncate = false;
  let reportFailing = false;
  const deliveries: GatewayReceipt[][] = [];
  const stored = new Map<string, GatewayReceipt>();
  const server = createServer(async (request, response) => {
    if (!request.url?.startsWith("/api/v1/gateway/receipts")) {
      response.writeHead(404).end();
      return;
    }
    const post = request.method === "POST";
    if (request.headers.authorization !== "Bearer " + (post ? writeCredential : reportCredential)) {
      badCredential = true;
      response.writeHead(401).end();
      return;
    }
    if (!post) {
      reportCalls++;
      if (reportFailing) {
        response.writeHead(503).end();
        return;
      }
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ receipts: Array.from(stored.values()), truncated: truncate }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { receipts } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { receipts: GatewayReceipt[] };
    deliveries.push(receipts);
    if (failing) {
      response.writeHead(503).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        results: receipts.map((item) => {
          stored.set(item.requestId, item);
          return { requestId: item.requestId, revision: item.revision, status: "accepted" };
        }),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const listening = server.address();
  if (!listening || typeof listening === "string") throw new Error("Expected a loopback port");
  const port = String(listening.port);
  const previous = {
    port: process.env.USAGEMAX_GATEWAY_LOCAL_PORT,
    report: process.env.USAGEMAX_GATEWAY_REPORT_TOKEN,
    project: process.env.USAGEMAX_GATEWAY_PROJECT_ID,
  };
  try {
    process.env.USAGEMAX_GATEWAY_LOCAL_PORT = port;
    process.env.USAGEMAX_GATEWAY_REPORT_TOKEN = reportCredential;
    process.env.USAGEMAX_GATEWAY_PROJECT_ID = "gateway-project-fixture";
    await run("env", "set", "USAGEMAX_GATEWAY_LOCAL_PORT", port);
    await run("env", "set", "USAGEMAX_GATEWAY_INGEST_TOKEN", writeCredential);
    await run("env", "set", "SONNELY_ADMIN_WALLETS", fixtureWallet);

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
    const memberWallet = "fixture-gateway-member-" + randomUUID();
    const member = await signIn(memberWallet);
    const admin = await signIn(fixtureWallet);
    const checkout = {
      reference: randomUUID(),
      amount: 1000,
      recipient: "fixture-treasury",
      mint: "fixture-mint",
      cluster: "mainnet",
    };
    await db.mutation(api.sonnely.createDeposit, { ...member.auth, ...checkout });
    await db.mutation(api.sonnely.confirmDeposit, {
      ...member.auth,
      reference: checkout.reference,
      signature: randomUUID(),
    });
    const model = "fixture-model";
    const reservation = await db.mutation(api.sonnely.reserve, { ...member.auth, model, cost: 1000 });
    const privateProviderId = randomUUID();
    await db.mutation(api.sonnely.settle, {
      secret,
      id: reservation,
      status: "complete",
      input: 40,
      output: 10,
      cost: 110,
      providerRequest: privateProviderId,
      usageMaxDetails: { stream: true, usage: { inputTokens: 30, outputTokens: 10, cacheReadTokens: 10 } },
    });
    const requestId = await gatewayRequestId(reservation);
    await run("run", "usageMaxOutbox:dispatch", "{}");
    const initial = deliveries.flat().find((item) => item.requestId === requestId);
    expect(initial).toMatchObject({
      revision: 1,
      customerChargeNanos: 110_000,
      providerCostNanos: null,
      providerCostBasis: "unknown",
      usage: { inputTokens: 30, outputTokens: 10, cacheReadTokens: 10 },
    });
    expect(initial?.usage).not.toHaveProperty("reportedTotalTokens");
    for (const privateValue of [reservation, privateProviderId, memberWallet, member.auth.session])
      expect(JSON.stringify(initial)).not.toContain(privateValue);
    expect((await db.query(api.sonnely.profile, member.auth))?.balance).toBe(890);
    const state = JSON.parse(
      await run(
        "run",
        "--inline-query",
        'await ctx.db.query("usageMaxOutbox").withIndex("by_request", q => q.eq("receipt.requestId", ' +
          JSON.stringify(requestId) +
          ")).unique()",
      ),
    );
    expect(state).toMatchObject({ state: "queued", attempts: 1 });
    expect(state.nextAt).toBeGreaterThan(Date.now());

    const lookup = (token?: string) =>
      GET(
        new NextRequest("http://127.0.0.1/api/sonnely/admin", {
          headers: token ? { cookie: "sonnely_session=" + token } : {},
        }),
        { params: Promise.resolve({ task: "admin" }) },
      );
    expect((await lookup()).status).toBe(401);
    expect((await lookup(member.token)).status).toBe(403);
    expect(reportCalls).toBe(0);

    failing = false;
    expect(
      await db.mutation(api.finance.reconcile, {
        ...admin.auth,
        costs: [{ requestId: privateProviderId, costNanoUsd: 100_000 }],
      }),
    ).toBe(1);
    await run("run", "usageMaxOutbox:dispatch", "{}");
    expect(stored.get(requestId)).toMatchObject({
      requestId,
      revision: 2,
      settledAt: initial!.settledAt,
      customerChargeNanos: 110_000,
      providerCostNanos: 100_000,
      providerCostBasis: "provider_reported",
    });

    truncate = true;
    const authorized = await lookup(admin.token);
    expect(authorized.status).toBe(200);
    const overview = await authorized.json();
    expect(overview.gateway).toMatchObject({
      state: "available",
      completed: 1,
      truncated: true,
      latestSettledAt: initial!.settledAt,
    });
    expect(overview.gateway.latestReceiptUrl).toBe(
      "https://usagemax.com/workspace/gateway?projectId=gateway-project-fixture&requestId=" + requestId,
    );
    expect(JSON.stringify(overview)).not.toContain(reportCredential);
    reportFailing = true;
    const degraded = await lookup(admin.token);
    expect(degraded.status).toBe(200);
    expect(await degraded.json()).toMatchObject({ gateway: { state: "unavailable" }, stats: overview.stats });
    expect(badCredential).toBe(false);
  } finally {
    for (const name of localSettings) await run("env", "remove", name).catch(() => {});
    if (previous.port === undefined) delete process.env.USAGEMAX_GATEWAY_LOCAL_PORT;
    else process.env.USAGEMAX_GATEWAY_LOCAL_PORT = previous.port;
    if (previous.report === undefined) delete process.env.USAGEMAX_GATEWAY_REPORT_TOKEN;
    else process.env.USAGEMAX_GATEWAY_REPORT_TOKEN = previous.report;
    if (previous.project === undefined) delete process.env.USAGEMAX_GATEWAY_PROJECT_ID;
    else process.env.USAGEMAX_GATEWAY_PROJECT_ID = previous.project;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
