// SPEC.md, "Conformance": spec/app/support.md against the application's stored machine, observed as what the store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__support.conformance.ts";
import type { Machine } from "../../gen/app__support.effect.vibe";
import type { Event, Tickets } from "../../gen/app__support.ts";
import { dispatch, support } from "../../src/api/support.vibe";

const refused = () => Effect.succeed("refused" as const);
/** A refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The queue as stored; an empty queue reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("support")), (found) =>
    found === undefined ? null : (JSON.parse(found) as Tickets),
  );

export const driver = effectDriver<Event, Tickets | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(support, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One queue, so one key; the initial queue is the empty store. */
export const options: Options<Tickets | null> = { keys: ["support"], view: (s) => (s.tickets.length === 0 ? null : s) };
