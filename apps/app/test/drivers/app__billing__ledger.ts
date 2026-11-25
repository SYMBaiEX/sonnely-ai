// SPEC.md, "Conformance": spec/app/billing/ledger.md against the shell of src/api/billing.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__billing__ledger.conformance.ts";
import type { Machine } from "../../gen/app__billing__ledger.effect.vibe";
import type { Event, Ledger } from "../../gen/app__billing__ledger.ts";
import { dispatchLedger, ledgerMachine } from "../../src/api/billing.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatchLedger(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The ledger as stored; an empty balance with no entries reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("billing-ledger")), (found) => {
    const l = found === undefined ? null : (JSON.parse(found) as Ledger);
    return l === null || (l.balance === 0 && l.entries.length === 0) ? null : l;
  });

export const driver = effectDriver<Event, Ledger | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(ledgerMachine(), KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One ledger, so one key; the initial ledger is the empty store. */
export const options: Options<Ledger | null> = {
  keys: ["billing-ledger"],
  view: (l) => (l.balance === 0 && l.entries.length === 0 ? null : l),
};
