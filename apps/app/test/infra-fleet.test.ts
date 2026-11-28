// spec/app/console/index.md, "Story: Choose how this device shows the console": the fleet cache
// evicts the longest-untouched machines past its bound, and an evicted machine reloads from the
// store with its state intact — but never while a stream subscriber still listens.
import { Effect, Fiber, Layer, Stream } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { describe, expect, it } from "vitest";
import { Fleet, fleetLive } from "../src/fleet.vibe";

const layer = Layer.provideMerge(fleetLive, KeyValueStore.layerMemory);

function providePipe<A, E, R>(program: Effect.Effect<A, E, R>): Promise<A> {
  return Effect.runPromise(Effect.provide(program, layer) as Effect.Effect<A, E, never>);
}

function overflow(fleet: Fleet.Shape, skip: string) {
  return Effect.gen(function* () {
    for (let index = 0; index < 210; index++) {
      yield* fleet.machine("console", "filler-" + skip + "-" + index);
    }
  });
}

describe("fleet machine cache", () => {
  it("evicts the longest-untouched machine past the bound and reloads its state", async () => {
    const program = Effect.gen(function* () {
      const fleet = yield* Fleet;
      const first = yield* fleet.machine("console", "wallet-evict");
      yield* first.receive({ type: "setPlain", on: true });
      yield* overflow(fleet, "a");
      const reloaded = yield* fleet.machine("console", "wallet-evict");
      const state = (yield* reloaded.get()) as { plain: boolean };
      return { rebuilt: reloaded !== first, plain: state.plain };
    });
    expect(await providePipe(program)).toEqual({ rebuilt: true, plain: true });
  });

  it("keeps a machine its stream subscribers are listening to", async () => {
    const program = Effect.gen(function* () {
      const fleet = yield* Fleet;
      const first = yield* fleet.machine("console", "wallet-streaming");
      const fiber = yield* Effect.forkChild(Stream.runDrain(first.changes));
      yield* Effect.yieldNow;
      yield* overflow(fleet, "b");
      const after = yield* fleet.machine("console", "wallet-streaming");
      yield* Fiber.interrupt(fiber);
      return { sameInstance: after === first };
    });
    expect(await providePipe(program)).toEqual({ sameInstance: true });
  });

  it("evicts once the last subscriber leaves", async () => {
    const program = Effect.gen(function* () {
      const fleet = yield* Fleet;
      const first = yield* fleet.machine("console", "wallet-unsubscribed");
      const fiber = yield* Effect.forkChild(Stream.runDrain(first.changes));
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      yield* overflow(fleet, "c");
      const after = yield* fleet.machine("console", "wallet-unsubscribed");
      return { rebuilt: after !== first };
    });
    expect(await providePipe(program)).toEqual({ rebuilt: true });
  });
});

describe("legacy fleet state (spec/app/console/index.md, \"The console starts unnamed with factory defaults\")", () => {
  function seedAndLoad(machine: string, wallet: string, stored: unknown) {
    return Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore;
      yield* kv.set(machine + ":" + wallet, JSON.stringify(stored));
      const fleet = yield* Fleet;
      const instance = yield* fleet.machine(machine, wallet);
      return yield* instance.get();
    });
  }

  it("loads a legacy console state missing plain and history with the factory choices", async () => {
    const legacy = { name: "Ada", username: "ada", theme: "Light" };
    const state = (await providePipe(seedAndLoad("console", "wallet-legacy-plain", legacy))) as Record<string, unknown>;
    expect(state).toEqual({ name: "Ada", username: "ada", theme: "Light", plain: true, history: true });
  });

  it("drops the retired saveOnDevice field and keeps the stored choices", async () => {
    const legacy = { name: "Ada", username: "ada", theme: "Dark", plain: false, history: false, saveOnDevice: true };
    const state = (await providePipe(seedAndLoad("console", "wallet-legacy-retired", legacy))) as Record<string, unknown>;
    expect(state).toEqual({ name: "Ada", username: "ada", theme: "Dark", plain: false, history: false });
  });

  // spec/app/console/chat.md, "A conversation is an alternating run of user and assistant messages"
  it("loads a legacy chat state whose messages miss their model with the inherited one", async () => {
    const legacy = {
      threads: [
        {
          id: "thread-legacy",
          model: "thread-model",
          messages: [
            { role: "User", content: "hi" },
            { role: "Assistant", content: "hello", model: "kept-model", tokens: 4 },
          ],
          retiredThreadField: true,
        },
        {
          id: "thread-older",
          messages: [{ role: "User", content: "older" }],
        },
      ],
      active: "thread-legacy",
      model: "root-model",
      retiredRootField: 1,
    };
    const state = (await providePipe(seedAndLoad("console__chat", "wallet-legacy-chat", legacy))) as {
      threads: { id: string; model: string; messages: { role: string; content: string; model: string }[] }[];
      active: string;
      model: string;
    };
    expect(state).toEqual({
      threads: [
        {
          id: "thread-legacy",
          model: "thread-model",
          messages: [
            { role: "User", content: "hi", model: "thread-model" },
            { role: "Assistant", content: "hello", model: "kept-model" },
          ],
        },
        {
          id: "thread-older",
          model: "root-model",
          messages: [{ role: "User", content: "older", model: "root-model" }],
        },
      ],
      active: "thread-legacy",
      model: "root-model",
    });
  });

  it("loads a current chat state exactly as stored", async () => {
    const current = {
      threads: [{ id: "thread-now", model: "m", messages: [{ role: "User", content: "hi", model: "m" }] }],
      active: "thread-now",
      model: "m",
    };
    const state = await providePipe(seedAndLoad("console__chat", "wallet-current-chat", current));
    expect(state).toEqual(current);
  });
});
