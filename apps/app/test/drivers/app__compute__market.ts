// SPEC.md, "Conformance": spec/app/compute/market.md against src/api/compute/market.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__compute__market.conformance.ts";
import type { Machine } from "../../gen/app__compute__market.effect.vibe";
import type { Event, Market } from "../../gen/app__compute__market.ts";
import { dispatch, market } from "../../src/api/compute/market.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The offers as stored; no offers reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("market")), (found) => {
    const m = found === undefined ? null : (JSON.parse(found) as Market);
    return m === null || m.offers.length === 0 ? null : m;
  });

export const driver = effectDriver<Event, Market | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(market, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One market machine, so one key; the empty market is the empty store. */
export const options: Options<Market | null> = { keys: ["market"], view: (m) => (m.offers.length === 0 ? null : m) };
