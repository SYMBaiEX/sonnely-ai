// spec/app/console/index.md against the shell of src/api/console.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__console.conformance.ts";
import type { Machine } from "../../gen/app__console.effect.vibe";
import type { Console, Event } from "../../gen/app__console.ts";
import { consoleStore, dispatch, initial } from "../../src/api/console.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The stored profile; the factory settings read as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("console")), (found) => {
    if (found === undefined) {
      return null;
    }
    const c = JSON.parse(found) as Console;
    return JSON.stringify(c) === JSON.stringify(initial) ? null : c;
  });

export const driver = effectDriver<Event, Console | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(consoleStore, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One workspace, so one key; the factory settings are the empty store. */
export const options: Options<Console | null> = {
  keys: ["console"],
  view: (c) => (JSON.stringify(c) === JSON.stringify(initial) ? null : c),
};
