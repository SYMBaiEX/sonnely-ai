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
