// spec/app/console/logs.md, "Served requests are recorded newest first"
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { describe, expect, it } from "vitest";
import * as Usage from "../gen/app__usage.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import type { Logs } from "../gen/app__console__logs.ts";
import { scanServed } from "../src/api/console/logs.vibe";
import { fleetLive } from "../src/fleet.vibe";

const wallet = "logs-pipeline-wallet";
const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const keyRecord = { id: "key-hash", prefix: "sonnely_live_test", status: "Active" as const, spendLimit: -1, spent: 0 };
const dayMs = 86_400_000;

function stateLayer() {
  return Layer.provideMerge(
    Layer.mergeAll(Usage.stored("logs-pipeline-usage"), Requests.stored("logs-pipeline-requests"), fleetLive),
    KeyValueStore.layerMemory,
  );
}

function readLogs() {
  return Effect.gen(function* () {
    const found = yield* KeyValueStore.KeyValueStore.use((kv) => kv.get("console__logs:" + wallet));
    return found === undefined ? undefined : (JSON.parse(found) as Logs);
  });
}

function providePipe<A, E, R>(program: Effect.Effect<A, E, R>): Promise<A> {
  return Effect.runPromise(Effect.provide(program, stateLayer()) as Effect.Effect<A, E, never>);
}

describe("console logs pipeline", () => {
  // spec/app/console/logs.md, "Served requests are recorded newest first"
  it("records a settled request on the owning wallet's logs machine", async () => {
    const now = Date.now();
    const program = Effect.gen(function* () {
      const requests = yield* Requests.Machine;
      yield* requests.send({ type: "open", ref: "ref-complete", key: keyRecord, endpoint: "ChatCompletions", model, stream: false });
      const usage = yield* Usage.Machine;
      yield* usage.send({ type: "record", id: "ref-complete", time: now - 500, keyName: "Console", keyId: "", project: "", model, provider: "NearAI", cost: 50 }, wallet);
      yield* usage.send({ type: "charge", id: "ref-complete", input: 10, output: 5, cached: -1, cost: 42, providerMs: 120 }, wallet);
      yield* scanServed(yield* usage.get(), new Set());
      return yield* readLogs();
    });
    const logs = await providePipe(program);
    const entry = logs?.entries.find((row) => row.id === "ref-complete");
    expect(entry).toMatchObject({
      model,
      provider: "near-ai",
      endpoint: "chat/completions",
      keyName: "Console",
      status: "Complete",
      input: 10,
      output: 5,
      cost: 42,
      durationMs: 120,
      ageDays: 0,
    });
  });

  // spec/app/console/logs.md, "Request ids are never repeated"
  it("records failed rows, derives age from the row's time and leaves pending rows out", async () => {
    const now = Date.now();
    const program = Effect.gen(function* () {
      const requests = yield* Requests.Machine;
      yield* requests.send({ type: "open", ref: "ref-failed", key: keyRecord, endpoint: "ResponsesApi", model: "z-ai/glm-5.3", stream: true });
      const usage = yield* Usage.Machine;
      yield* usage.send({ type: "record", id: "ref-failed", time: now - 2 * dayMs, keyName: "ci", keyId: "", project: "", model: "z-ai/glm-5.3", provider: "Phala", cost: 30 }, wallet);
      yield* usage.send({ type: "record", id: "ref-pending", time: now, keyName: "ci", keyId: "", project: "", model: "z-ai/glm-5.3", provider: "Phala", cost: 30 }, wallet);
      yield* usage.send({ type: "release", id: "ref-failed" }, wallet);
      const seen = new Set<string>();
      yield* scanServed(yield* usage.get(), seen);
      yield* scanServed(yield* usage.get(), seen);
      return yield* readLogs();
    });
    const logs = await providePipe(program);
    const failed = logs?.entries.find((row) => row.id === "ref-failed");
    const pending = logs?.entries.find((row) => row.id === "ref-pending");
    expect({ failed, pending, count: logs?.entries.filter((row) => row.id === "ref-failed").length }).toMatchObject({
      failed: { status: "Failed", endpoint: "responses", provider: "phala", ageDays: 2 },
      pending: undefined,
      count: 1,
    });
  });

  // spec/app/console/logs.md, "Request ids are never repeated"
  it("never double-records when the scan replays without its seen set", async () => {
    const now = Date.now();
    const program = Effect.gen(function* () {
      const requests = yield* Requests.Machine;
      yield* requests.send({ type: "open", ref: "ref-once", key: keyRecord, endpoint: "ChatCompletions", model, stream: false });
      const usage = yield* Usage.Machine;
      yield* usage.send({ type: "record", id: "ref-once", time: now, keyName: "Console", keyId: "", project: "", model, provider: "NearAI", cost: 50 }, wallet);
      yield* usage.send({ type: "charge", id: "ref-once", input: 3, output: 2, cached: -1, cost: 5, providerMs: 40 }, wallet);
      const state = yield* usage.get();
      yield* scanServed(state, new Set());
      yield* scanServed(state, new Set());
      return yield* readLogs();
    });
    const logs = await providePipe(program);
    expect(logs?.entries.filter((row) => row.id === "ref-once")).toHaveLength(1);
  });
});
