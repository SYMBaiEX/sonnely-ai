// SPEC.md, "Conformance": spec/app/keys.md against the application's stored machine, observed as what the store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__keys.conformance.ts";
import type { Machine } from "../../gen/app__keys.effect.vibe";
import type { Event, Keys } from "../../gen/app__keys.ts";
import { dispatch, keys } from "../../src/api/keys.vibe";

const refused = () => Effect.succeed("refused" as const);
/** A refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown, by?: unknown) =>
  dispatch(input, by).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused, NotASender: refused }),
  );

/** The registry as stored; an empty registry reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("workspace-keys")), (found) =>
    found === undefined ? null : (JSON.parse(found) as Keys),
  );

export const driver = effectDriver<Event, Keys | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(keys, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One registry, so one key; the initial registry is the empty store. */
export const options: Options<Keys | null> = { keys: ["workspace-keys"], view: (s) => (s.keys.length === 0 ? null : s) };
