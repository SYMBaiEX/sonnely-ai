// spec/app/console/batch.md against the shell of src/api/console/batch.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__console__batch.conformance.ts";
import type { Machine } from "../../gen/app__console__batch.effect.vibe";
import type { Batch, Event } from "../../gen/app__console__batch.ts";
import { batchDispatch, batchStore, initial } from "../../src/api/console/batch.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  batchDispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The stored upload; no staged rows reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("console__batch")), (found) => {
    if (found === undefined) {
      return null;
    }
    const b = JSON.parse(found) as Batch;
    return JSON.stringify(b) === JSON.stringify(initial) ? null : b;
  });

export const driver = effectDriver<Event, Batch | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(batchStore, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One upload at a time, so one key; the empty upload is the empty store. */
export const options: Options<Batch | null> = {
  keys: ["console__batch"],
  view: (b) => (JSON.stringify(b) === JSON.stringify(initial) ? null : b),
};
