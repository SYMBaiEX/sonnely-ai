import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import bs58 from "bs58";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PROGRAM_ADDRESS, getTransferCheckedInstructionDataEncoder } from "@solana-program/token";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Crm from "../gen/app__admin__crm.effect.vibe";
import * as Referrals from "../gen/app__admin__referrals.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Payouts from "../gen/app__billing__payouts.effect.vibe";
import * as Session from "../gen/app__session.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { adminApi } from "../src/api/admin.vibe";
import { payoutsApi } from "../src/api/payouts.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const operator = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const treasury = "84LTdiKzGLHWQK2kpQzjTK8aYj8fp7mVdY91EuH6ZFYx";
const payoutWallet = "9Bn8PpGhhp2a2xR1AnkpENPJNZe1m3Av852p993QdxUQ";
const token = "payout-api-test-session";
const signature = bs58.encode(new Uint8Array(64).fill(19));
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const cleanups: Array<() => void | Promise<void>> = [];

process.env.SOLANA_BILLING_CLUSTER = "mainnet";
process.env.SOLANA_RPC_URL = "https://rpc.example.test";
process.env.SOLANA_TREASURY = treasury;

function stateLayer(dir: string) {
  return Layer.provideMerge(
    Layer.mergeAll(
      Admin.stored("admin"),
      Crm.stored("admin-crm"),
      Referrals.stored("admin-referrals"),
      Ledger.stored("billing-ledger"),
      Payouts.stored("billing-payouts"),
      Session.stored("session"),
      Usage.stored("usage"),
    ),
    store(dir),
  );
}

function writeSession(dir: string) {
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [{ digest: sessionDigest(token), nonce: "nonce", wallet: operator, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" }],
  }));
}

function writeRevenue(dir: string) {
  writeFileSync(join(dir, "billing-ledger"), JSON.stringify({
    balance: 0,
    entries: [
      { wallet: operator, kind: "Credit", detail: "deposit-a", amount: 110 },
      { wallet: operator, kind: "Reserve", detail: "request-a", amount: 110 },
      { wallet: operator, kind: "Release", detail: "request-a", amount: 110 },
      { wallet: operator, kind: "Charge", detail: "request-a", amount: 110 },
    ],
  }));
  writeFileSync(join(dir, "usage"), JSON.stringify({
    rows: [{ id: "request-a", time: 1, keyName: "Console", keyId: "", project: "", wallet: operator, model: "model", provider: "NearAI", input: 1, output: 1, cached: 0, cost: 110, providerMs: 1, status: "Complete" }],
  }));
}

function makeApi() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-payout-api-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeSession(dir);
  writeRevenue(dir);
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const appLayer = Layer.provideMerge(Layer.mergeAll(payoutsApi, adminApi), stateLayer(dir)).pipe(
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
    headers: { "content-type": "application/json", ...(cookie ? { cookie: "sonnely_session=" + token } : {}) },
    body: JSON.stringify(body),
  }));
}

async function grantOperator(handler: (request: Request) => Promise<Response>) {
  const response = await post(handler, "/api/machines/admin", { type: "grant", wallet: operator, role: "Admin", at: 1, by: operator }, false);
  if (!response.ok) throw new Error("operator grant failed: " + response.status);
}

function jsonRpc(result: unknown, id: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

let payoutReference = "";

function stubRpc(options: { finalized: boolean }) {
  const source = "11111111111111111111111111111115";
  const destination = "11111111111111111111111111111116";
  const amount = 5;
  vi.stubGlobal("fetch", (_url: unknown, init?: RequestInit) => {
    if (typeof init?.body !== "string") throw new Error("JSON-RPC request body unavailable");
    type RpcRequest = { id: unknown; method: string };
    const payload = JSON.parse(init.body) as RpcRequest | RpcRequest[];
    const batched = Array.isArray(payload) ? payload : [payload];
    const request = batched[0];
    const reply = (result: unknown) => jsonRpc(result, request.id);
    if (request.method === "getGenesisHash") return reply(genesis);
    if (request.method === "getLatestBlockhash") {
      return reply({ context: { slot: 10 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 123 } });
    }
    if (request.method === "simulateTransaction") {
      return reply({ context: { slot: 10 }, value: { err: null, logs: [], unitsConsumed: 40_000 } });
    }
    expect(request.method).toBe("getTransaction");
    if (!options.finalized) return reply(null);
    const balance = (owner: string, value: number, accountIndex: number) => ({
      owner,
      mint,
      programId: TOKEN_PROGRAM_ADDRESS,
      accountIndex,
      uiTokenAmount: { amount: String(value), decimals: 6 },
    });
    const data = getTransferCheckedInstructionDataEncoder().encode({ amount, decimals: 6 });
    return reply({
      version: 0,
      blockTime: 1_799_999_999,
      meta: {
        err: null,
        loadedAddresses: { writable: [], readonly: [payoutReference] },
        preTokenBalances: [balance(treasury, amount, 2), balance(payoutWallet, 0, 3)],
        postTokenBalances: [balance(treasury, 0, 2), balance(payoutWallet, amount, 3)],
      },
      transaction: {
        signatures: [signature],
        message: {
          accountKeys: [treasury, operator, source, destination, mint, TOKEN_PROGRAM_ADDRESS],
          header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 2 },
          instructions: [{ programIdIndex: 5, accounts: [2, 4, 3, 0, 6], data: bs58.encode(Uint8Array.from(data)) }],
        },
      },
    });
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("admin payout API", () => {
  // spec/app/billing/payouts.md, "A payout covers only the markup share of the revenue window"
  it("derives margin from ledger-linked inference charges and prepares an unsigned payout", async () => {
    stubRpc({ finalized: false });
    const { handler } = makeApi();
    await grantOperator(handler);
    const denied = await handler(new Request("http://localhost/api/admin/payouts"));
    const positionResponse = await handler(new Request("http://localhost/api/admin/payouts", { headers: { cookie: "sonnely_session=" + token } }));
    const position = (await positionResponse.json()) as { position: { chargeTotal: number; marginMicros: number; availableMicros: number; throughEntry: number } };
    const tooMuch = await post(handler, "/api/admin/payouts/prepare", { amount: 11, version: 0 });
    const prepared = await post(handler, "/api/admin/payouts/prepare", { amount: 5, version: 0 });
    const body = (await prepared.json()) as { payout?: { reference: string; throughEntry: number; chargeTotal: number; amount: number }; transaction?: string };
    expect({
      deniedStatus: denied.status,
      positionStatus: positionResponse.status,
      chargeTotal: position.position.chargeTotal,
      margin: position.position.marginMicros,
      available: position.position.availableMicros,
      throughEntry: position.position.throughEntry,
      tooMuchStatus: tooMuch.status,
      preparedStatus: prepared.status,
      payout: body.payout === undefined ? undefined : { amount: body.payout.amount, throughEntry: body.payout.throughEntry, chargeTotal: body.payout.chargeTotal },
      hasTransaction: typeof body.transaction == "string" && body.transaction.length > 0,
    }).toEqual({
      deniedStatus: 401,
      positionStatus: 200,
      chargeTotal: 110,
      margin: 10,
      available: 10,
      throughEntry: 4,
      tooMuchStatus: 409,
      preparedStatus: 200,
      payout: body.payout === undefined ? undefined : { amount: body.payout.amount, throughEntry: body.payout.throughEntry, chargeTotal: body.payout.chargeTotal },
      hasTransaction: true,
    });
  });

  // spec/app/billing/payouts.md, "Verification requires the same signature and exact prepared terms"
  it("records an execution as pending, then verifies the finalized exact transfer once", async () => {
    stubRpc({ finalized: false });
    const { handler } = makeApi();
    await grantOperator(handler);
    const prepared = await post(handler, "/api/admin/payouts/prepare", { amount: 5, version: 0 });
    const body = (await prepared.json()) as { payout: { reference: string } };
    payoutReference = body.payout.reference;
    const first = await post(handler, "/api/admin/payouts/execute", { reference: body.payout.reference, signature });
    const firstBody = (await first.json()) as { status?: string; pending?: boolean };
    vi.unstubAllGlobals();
    stubRpc({ finalized: true });
    const second = await post(handler, "/api/admin/payouts/execute", { reference: body.payout.reference, signature });
    const secondBody = (await second.json()) as { status?: string };
    const machine = await handler(new Request("http://localhost/api/machines/billing-payouts"));
    const payouts = (await machine.json()) as Payouts.Payouts;
    expect({
      firstStatus: first.status,
      firstBodyStatus: firstBody.status,
      firstPending: firstBody.pending,
      secondStatus: second.status,
      secondBodyStatus: secondBody.status,
      recordedTag: payouts.payouts[0]?.status.tag,
      recordedSignature: "signature" in (payouts.payouts[0]?.status ?? {}) ? (payouts.payouts[0]?.status as { signature: string }).signature : "",
    }).toEqual({
      firstStatus: 200,
      firstBodyStatus: "executed",
      firstPending: true,
      secondStatus: 200,
      secondBodyStatus: "verified",
      recordedTag: "Verified",
      recordedSignature: signature,
    });
  });
});
