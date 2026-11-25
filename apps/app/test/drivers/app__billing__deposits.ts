// SPEC.md, "Conformance": spec/app/billing/deposits.md against the shell of src/api/billing.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__billing__deposits.conformance.ts";
import type { Machine } from "../../gen/app__billing__deposits.effect.vibe";
import type { Deposits, Event } from "../../gen/app__billing__deposits.ts";
import { depositsMachine, dispatchDeposits } from "../../src/api/billing.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatchDeposits(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The intents as stored; no intents reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("billing-deposits")), (found) => {
    const d = found === undefined ? null : (JSON.parse(found) as Deposits);
    return d === null || d.intents.length === 0 ? null : d;
  });

export const driver = effectDriver<Event, Deposits | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(depositsMachine(), KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One deposit book, so one key; the empty book is the empty store. */
export const options: Options<Deposits | null> = {
  keys: ["billing-deposits"],
  view: (d) => (d.intents.length === 0 ? null : d),
};
