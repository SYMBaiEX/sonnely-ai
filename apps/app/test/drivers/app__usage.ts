// SPEC.md, "Conformance": spec/app/usage.md against the application's stored machine, observed as what the store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__usage.conformance.ts";
import type { Machine } from "../../gen/app__usage.effect.vibe";
import type { Event, Usage } from "../../gen/app__usage.ts";
import { dispatch, usage } from "../../src/api/usage.vibe";

const refused = () => Effect.succeed("refused" as const);
/** A refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown, by?: unknown) =>
  dispatch(input, by).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused, NotASender: refused }),
  );

/** The meter as stored; an empty meter reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("usage")), (found) =>
    found === undefined ? null : (JSON.parse(found) as Usage),
  );

export const driver = effectDriver<Event, Usage | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(usage, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One meter, so one key; the initial meter is the empty store. */
export const options: Options<Usage | null> = { keys: ["usage"], view: (s) => (s.rows.length === 0 ? null : s) };
