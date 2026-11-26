// spec/app/billing/payouts.md, "A payout binds margin to one exact treasury transfer"
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__billing__payouts.conformance.ts";
import type { Machine } from "../../gen/app__billing__payouts.effect.vibe";
import type { Event, Payouts } from "../../gen/app__billing__payouts.ts";
import { dispatchPayouts, payoutsMachine } from "../../src/api/payouts.vibe";

const refused = () => Effect.succeed("refused" as const);
const receive = (_key: string, input: unknown) =>
  dispatchPayouts(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("billing-payouts")), (found) => {
    const payouts = found === undefined ? null : (JSON.parse(found) as Payouts);
    return payouts === null || payouts.payouts.length === 0 ? null : payouts;
  });

export const driver = effectDriver<Event, Payouts | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(payoutsMachine, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

export const options: Options<Payouts | null> = {
  keys: ["billing-payouts"],
  view: (payouts) => (payouts.payouts.length === 0 ? null : payouts),
};
