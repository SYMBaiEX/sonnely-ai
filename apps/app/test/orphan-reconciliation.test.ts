import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Layer, Scheduler } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import { balanceOf, heldOf } from "../gen/app__billing__ledger.ts";
import * as Usage from "../gen/app__usage.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import { sweepOrphanedReservations } from "../src/api/billing.vibe";
import { store } from "../src/serve.vibe";

const wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const cleanups: Array<() => void | Promise<void>> = [];

function makeLayer(dir: string) {
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  return Layer.provideMerge(
    Layer.mergeAll(
      Ledger.stored("billing-ledger"),
      Usage.stored("usage"),
      WorkspaceKeys.stored("workspace-keys"),
      Teams.stored("teams"),
      Requests.stored("gateway-requests"),
    ),
    store(dir),
  ).pipe(Layer.provideMerge(scheduler));
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("orphan reconciliation", () => {
  // spec/app/billing/ledger.md, "A failed reservation releases its whole hold"
  it("releases a stale pending reservation and closes its metering rows", async () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-orphan-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const old = Date.now() - 20 * 60 * 1000;
    writeFileSync(join(dir, "billing-ledger"), JSON.stringify({
      balance: 4900,
      entries: [
        { wallet, kind: "Credit", detail: "deposit", amount: 5000 },
        { wallet, kind: "Reserve", detail: "ref-orphan", amount: 100 },
      ],
    }));
    writeFileSync(join(dir, "usage"), JSON.stringify({
      rows: [{ id: "ref-orphan", time: old, keyName: "Console", keyId: "", project: "", wallet, model: "m", provider: "NearAI", input: 0, output: 0, cached: -1, cost: 100, providerMs: -1, status: "Pending" }],
    }));
    const program = Effect.gen(function* () {
      yield* sweepOrphanedReservations();
      const ledger = yield* Ledger.Machine;
      const state = yield* ledger.get();
      const usage = yield* Usage.Machine;
      const rows = (yield* usage.get()).rows;
      return { held: heldOf(state, wallet, "ref-orphan"), balance: balanceOf(state, wallet), status: rows[0]?.status };
    });
    const result = await Effect.runPromise(Effect.provide(program, makeLayer(dir)) as Effect.Effect<{ held: number; balance: number; status: string }, never, never>);
    expect(result).toEqual({ held: 0, balance: 5000, status: "Complete" });
  });

  // spec/app/billing/ledger.md, "A failed reservation releases its whole hold"
  it("retries missing compensations without refunding a key twice", async () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-orphan-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const old = Date.now() - 20 * 60 * 1000;
    const day = new Date(old).toISOString().slice(0, 10);
    writeFileSync(join(dir, "billing-ledger"), JSON.stringify({
      balance: 4960,
      entries: [
        { wallet, kind: "Credit", detail: "deposit", amount: 5000 },
        { wallet, kind: "Reserve", detail: "ref-partial", amount: 100 },
        { wallet, kind: "Release", detail: "ref-partial", amount: 100 },
        { wallet, kind: "Charge", detail: "ref-partial", amount: 40 },
      ],
    }));
    writeFileSync(join(dir, "usage"), JSON.stringify({
      rows: [{ id: "ref-partial", time: old, keyName: "Inference", keyId: "key-partial", project: "project-partial", wallet, model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", provider: "NearAI", input: 0, output: 0, cached: -1, cost: 100, providerMs: -1, status: "Pending" }],
    }));
    writeFileSync(join(dir, "workspace-keys"), JSON.stringify({
      keys: [{ id: "key-partial", label: "Inference", prefix: "sonnely_live_partial", hash: "partial-hash", wallet, project: "project-partial", scopes: ["inference"], cap: 0, dailyCap: 0, expiresAt: 0, status: "Active", createdAt: 1, lastUsedAt: old, spent: 100, dayKey: day, daySpent: 100 }],
    }));
    writeFileSync(join(dir, "gateway-requests"), JSON.stringify({
      requests: [{ ref: "ref-partial", key: { id: "partial-hash", prefix: "sonnely_live_partial", status: "Active", spendLimit: -1, spent: 100 }, endpoint: "ChatCompletions", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", stream: false, emitted: 0, status: "Serving", charged: -1 }],
    }));
    const program = Effect.gen(function* () {
      yield* sweepOrphanedReservations();
      const keys = yield* WorkspaceKeys.Machine;
      const afterFirst = (yield* keys.get()).keys[0];
      const usage = yield* Usage.Machine;
      const pendingAfterFirst = (yield* usage.get()).rows[0]?.status;
      const teams = yield* Teams.Machine;
      yield* teams.send({ type: "createTeam", id: "team-partial", name: "Team", actor: wallet, now: 1 });
      yield* teams.send({ type: "createProject", teamId: "team-partial", projectId: "project-partial", actor: wallet, name: "Project", budget: 10_000 });
      yield* teams.send({ type: "holdProject", projectId: "project-partial", amount: 100 });
      yield* sweepOrphanedReservations();
      const key = (yield* keys.get()).keys[0];
      const project = (yield* teams.get()).teams[0]?.projects[0];
      const row = (yield* usage.get()).rows[0];
      const requests = yield* Requests.Machine;
      const request = (yield* requests.get()).requests[0];
      return {
        afterFirst: afterFirst ? { spent: afterFirst.spent, daySpent: afterFirst.daySpent } : undefined,
        pendingAfterFirst,
        key: key ? { spent: key.spent, daySpent: key.daySpent } : undefined,
        project: project ? { spent: project.spent } : undefined,
        row: row ? { status: row.status, cost: row.cost } : undefined,
        request: request ? { status: request.status, charged: request.charged } : undefined,
      };
    });
    const result = await Effect.runPromise(Effect.provide(program, makeLayer(dir)) as Effect.Effect<{
      afterFirst: { spent: number; daySpent: number } | undefined;
      pendingAfterFirst: string | undefined;
      key: { spent: number; daySpent: number } | undefined;
      project: { spent: number } | undefined;
      row: { status: string; cost: number } | undefined;
      request: { status: string; charged: number } | undefined;
    }, never, never>);
    expect(result).toEqual({
      afterFirst: { spent: 40, daySpent: 40 },
      pendingAfterFirst: "Pending",
      key: { spent: 40, daySpent: 40 },
      project: { spent: 40 },
      row: { status: "Complete", cost: 40 },
      request: { status: "Complete", charged: 40 },
    });
  });

  // spec/app/billing/ledger.md, "A reservation holds only what the wallet covers, once per detail"
  it("leaves a young in-flight reservation untouched", async () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-orphan-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, "billing-ledger"), JSON.stringify({
      balance: 4900,
      entries: [
        { wallet, kind: "Credit", detail: "deposit", amount: 5000 },
        { wallet, kind: "Reserve", detail: "ref-live", amount: 100 },
      ],
    }));
    writeFileSync(join(dir, "usage"), JSON.stringify({
      rows: [{ id: "ref-live", time: Date.now() - 60_000, keyName: "Console", keyId: "", project: "", wallet, model: "m", provider: "NearAI", input: 0, output: 0, cached: -1, cost: 100, providerMs: -1, status: "Pending" }],
    }));
    const program = Effect.gen(function* () {
      yield* sweepOrphanedReservations();
      const ledger = yield* Ledger.Machine;
      const state = yield* ledger.get();
      return { held: heldOf(state, wallet, "ref-live"), balance: balanceOf(state, wallet) };
    });
    const result = await Effect.runPromise(Effect.provide(program, makeLayer(dir)) as Effect.Effect<{ held: number; balance: number }, never, never>);
    expect(result).toEqual({ held: 100, balance: 4900 });
  });
});
