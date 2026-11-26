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
    expect(result).toEqual({ held: 0, balance: 5000, status: "Failed" });
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
