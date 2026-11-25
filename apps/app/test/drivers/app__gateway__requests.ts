// SPEC.md, "Conformance": spec/app/gateway/requests.md against the shell of src/api/gateway.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__gateway__requests.conformance.ts";
import type { Machine } from "../../gen/app__gateway__requests.effect.vibe";
import type { Event, Gateway } from "../../gen/app__gateway__requests.ts";
import { dispatchRequests, requestsMachine } from "../../src/api/gateway.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatchRequests(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The served requests as stored; none served reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("gateway-requests")), (found) => {
    const g = found === undefined ? null : (JSON.parse(found) as Gateway);
    return g === null || g.requests.length === 0 ? null : g;
  });

export const driver = effectDriver<Event, Gateway | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(requestsMachine(), KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One ledger, so one key; the initial ledger is the empty store. */
export const options: Options<Gateway | null> = {
  keys: ["gateway-requests"],
  view: (g) => (g.requests.length === 0 ? null : g),
};
