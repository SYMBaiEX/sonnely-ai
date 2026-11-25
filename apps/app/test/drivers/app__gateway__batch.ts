// SPEC.md, "Conformance": spec/app/gateway/batch.md against the shell of src/api/gateway.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__gateway__batch.conformance.ts";
import type { Machine } from "../../gen/app__gateway__batch.effect.vibe";
import type { Batch, Event } from "../../gen/app__gateway__batch.ts";
import { batchMachine, dispatchBatch } from "../../src/api/gateway.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatchBatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The batch job as stored; no running job reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("gateway-batch")), (found) => {
    const b = found === undefined ? null : (JSON.parse(found) as Batch);
    return b === null || b.tag === "Empty" ? null : b;
  });

export const driver = effectDriver<Event, Batch | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(batchMachine(), KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One job per wallet at a time, so one key; no running job is the empty store. */
export const options: Options<Batch | null> = {
  keys: ["gateway-batch"],
  view: (b) => (b.tag === "Empty" ? null : b),
};
