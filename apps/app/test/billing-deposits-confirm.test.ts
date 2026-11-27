// spec/app/billing/deposits.md, "An expired intent is closed to new payments, not to timely ones"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import bs58 from "bs58";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PROGRAM_ADDRESS, getTransferCheckedInstructionDataEncoder } from "@solana-program/token";
import * as Session from "../gen/app__session.effect.vibe";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Deposits from "../gen/app__billing__deposits.effect.vibe";
import * as Referrals from "../gen/app__admin__referrals.effect.vibe";
import { billingApi } from "../src/api/billing.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";
import { mints } from "../src/api/billing/solana.ts";

const payer = "11111111111111111111111111111112";
const recipient = "11111111111111111111111111111114";
const reference = "11111111111111111111111111111113";
const source = "11111111111111111111111111111115";
const destination = "11111111111111111111111111111116";
const paymentSignature = bs58.encode(new Uint8Array(64).fill(17));
const genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const token = "deposits-confirm-session";
const cleanups: Array<() => void | Promise<void>> = [];

let chainBlockTime = 0;

function stubChain() {
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: request.id, result });
    if (request.method === "getGenesisHash") return reply(genesis);
    expect(request.method).toBe("getTransaction");
    const balance = (owner: string, amount: number, accountIndex: number) => ({
      owner,
      mint: mints.mainnet,
      programId: TOKEN_PROGRAM_ADDRESS,
      accountIndex,
      uiTokenAmount: { amount: String(amount), decimals: 6 },
    });
    const data = getTransferCheckedInstructionDataEncoder().encode({ amount: 5_000_000, decimals: 6 });
    return reply({
      version: 0,
      blockTime: chainBlockTime,
      meta: {
        err: null,
        loadedAddresses: { writable: [], readonly: [reference] },
        preTokenBalances: [balance(payer, 5_000_000, 2), balance(recipient, 0, 3)],
        postTokenBalances: [balance(payer, 0, 2), balance(recipient, 5_000_000, 3)],
      },
      transaction: {
        signatures: [paymentSignature],
        message: {
          accountKeys: [payer, "11111111111111111111111111111117", source, destination, mints.mainnet, TOKEN_PROGRAM_ADDRESS],
          header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 2 },
          instructions: [{ programIdIndex: 5, accounts: [2, 4, 3, 0, 6], data: bs58.encode(Uint8Array.from(data)) }],
        },
      },
    });
  });
}

function makeApp(status: { tag: string; signature?: string }, expiresAt: number) {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-deposits-confirm-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [{ digest: sessionDigest(token), nonce: "nonce", wallet: payer, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" }],
  }));
  writeFileSync(join(dir, "billing-ledger"), JSON.stringify({ balance: 0, entries: [] }));
  writeFileSync(join(dir, "billing-deposits"), JSON.stringify({
    intents: [{ reference, wallet: payer, asset: "USDC", amount: 5, atomic: 5_000_000, createdAt: expiresAt - 24 * 3_600_000, expiresAt, status }],
  }));
  writeFileSync(join(dir, "admin-referrals"), JSON.stringify({ codes: [], signups: [] }));
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const state = Layer.provideMerge(
    Layer.mergeAll(Ledger.stored("billing-ledger"), Deposits.stored("billing-deposits"), Session.stored("session"), Referrals.stored("admin-referrals")),
    store(dir),
  );
  const appLayer = Layer.provideMerge(Layer.provideMerge(billingApi, state), state).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return { handler: app.handler, dir };
}

function confirm(handler: (request: Request) => Promise<Response>) {
  return handler(new Request("http://localhost/api/billing/deposits/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "sonnely_session=" + token },
    body: JSON.stringify({ reference, signature: paymentSignature }),
  }));
}

function readOut(dir: string) {
  const deposits = JSON.parse(readFileSync(join(dir, "billing-deposits"), "utf8")) as { intents: { status: { tag: string } }[] };
  const ledger = JSON.parse(readFileSync(join(dir, "billing-ledger"), "utf8")) as { entries: { kind: string; detail: string }[] };
  return { tag: deposits.intents[0]?.status.tag, credited: ledger.entries.some((entry) => entry.kind === "Credit" && entry.detail === reference) };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("deposit confirmation by chain time", () => {
  it("finalizes an intent past its wall-clock deadline when the chain timed the transfer before it", async () => {
    vi.stubEnv("SOLANA_BILLING_CLUSTER", "mainnet");
    vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test");
    vi.stubEnv("SOLANA_TREASURY", recipient);
    const expiresAt = Date.now() - 3_600_000;
    chainBlockTime = Math.floor((expiresAt - 60_000) / 1000);
    stubChain();
    const { handler, dir } = makeApp({ tag: "Pending" }, expiresAt);
    const response = await confirm(handler);
    const body = await response.json() as { ok?: boolean; signature?: string };
    expect({ status: response.status, ok: body.ok, signature: body.signature, ...readOut(dir) }).toEqual({
      status: 200,
      ok: true,
      signature: paymentSignature,
      tag: "Finalized",
      credited: true,
    });
  });

  it("finalizes an intent the sweep already expired when the chain timed the transfer before the deadline", async () => {
    vi.stubEnv("SOLANA_BILLING_CLUSTER", "mainnet");
    vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test");
    vi.stubEnv("SOLANA_TREASURY", recipient);
    const expiresAt = Date.now() - 3_600_000;
    chainBlockTime = Math.floor((expiresAt - 60_000) / 1000);
    stubChain();
    const { handler, dir } = makeApp({ tag: "Expired" }, expiresAt);
    const response = await confirm(handler);
    const body = await response.json() as { ok?: boolean };
    expect({ status: response.status, ok: body.ok, ...readOut(dir) }).toEqual({ status: 200, ok: true, tag: "Finalized", credited: true });
  });

  it("refuses a transfer the chain timed after the deadline and never credits it", async () => {
    vi.stubEnv("SOLANA_BILLING_CLUSTER", "mainnet");
    vi.stubEnv("SOLANA_RPC_URL", "https://rpc.example.test");
    vi.stubEnv("SOLANA_TREASURY", recipient);
    const expiresAt = Date.now() - 3_600_000;
    chainBlockTime = Math.floor((expiresAt + 120_000) / 1000);
    stubChain();
    const { handler, dir } = makeApp({ tag: "Pending" }, expiresAt);
    const response = await confirm(handler);
    const body = await response.json() as { ok?: boolean; expired?: boolean };
    expect({ status: response.status, ok: body.ok, expired: body.expired, ...readOut(dir) }).toEqual({
      status: 410,
      ok: false,
      expired: true,
      tag: "Expired",
      credited: false,
    });
  });
});
