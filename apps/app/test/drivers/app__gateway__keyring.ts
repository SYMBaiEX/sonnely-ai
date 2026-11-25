// SPEC.md, "Conformance": spec/app/gateway/keyring.md against the shell of src/api/gateway.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__gateway__keyring.conformance.ts";
import type { Machine } from "../../gen/app__gateway__keyring.effect.vibe";
import type { Event, Keyring } from "../../gen/app__gateway__keyring.ts";
import { dispatchKeyring, keyringMachine } from "../../src/api/gateway.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatchKeyring(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The keys as stored; no enrolled key reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("keys")), (found) => {
    const k = found === undefined ? null : (JSON.parse(found) as Keyring);
    return k === null || k.keys.length === 0 ? null : k;
  });

export const driver = effectDriver<Event, Keyring | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(keyringMachine(), KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One keyring shared with the workspace, so one key; the initial keyring is the empty store. */
export const options: Options<Keyring | null> = {
  keys: ["keys"],
  view: (k) => (k.keys.length === 0 ? null : k),
};
