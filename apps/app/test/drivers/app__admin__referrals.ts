// spec/app/admin/referrals.md against the stored referrals machine, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__admin__referrals.conformance.ts";
import type { Machine } from "../../gen/app__admin__referrals.effect.vibe";
import type { Event, Referrals } from "../../gen/app__admin__referrals.ts";
import { dispatchReferral, referrals } from "../../src/api/admin.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatchReferral(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The pipeline as stored; nothing kept reads as nothing. */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("admin-referrals")), (found) =>
    found === undefined ? null : (JSON.parse(found) as Referrals));

export const driver = effectDriver<Event, Referrals | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(referrals, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

const untouched = (r: Referrals) => r.codes.length === 0 && r.signups.length === 0;
/** One pipeline, so one key; the initial pipeline is the empty store. */
export const options: Options<Referrals | null> = { keys: ["admin-referrals"], view: (r) => (untouched(r) ? null : r) };
