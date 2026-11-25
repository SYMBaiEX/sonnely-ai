// SPEC.md, "Conformance": spec/app/compute/instances.md against src/api/compute/instances.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__compute__instances.conformance.ts";
import type { Machine } from "../../gen/app__compute__instances.effect.vibe";
import type { Compute, Event } from "../../gen/app__compute__instances.ts";
import { dispatch, instances } from "../../src/api/compute/instances.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The runs as stored; no runs reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("instances")), (found) => {
    const c = found === undefined ? null : (JSON.parse(found) as Compute);
    return c === null || c.runs.length === 0 ? null : c;
  });

export const driver = effectDriver<Event, Compute | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(instances, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One runs machine, so one key; the empty marketplace is the empty store. */
export const options: Options<Compute | null> = { keys: ["instances"], view: (c) => (c.runs.length === 0 ? null : c) };
