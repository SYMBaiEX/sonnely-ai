// spec/app/console/logs.md against the shell of src/api/console/logs.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__console__logs.conformance.ts";
import type { Machine } from "../../gen/app__console__logs.effect.vibe";
import type { Event, Logs } from "../../gen/app__console__logs.ts";
import { logsDispatch, logsStore, initial } from "../../src/api/console/logs.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  logsDispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The stored history and filters; the seeded page reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("console__logs")), (found) => {
    if (found === undefined) {
      return null;
    }
    const l = JSON.parse(found) as Logs;
    return JSON.stringify(l) === JSON.stringify(initial) ? null : l;
  });

export const driver = effectDriver<Event, Logs | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(logsStore, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One request history, so one key; the seeded page is the empty store. */
export const options: Options<Logs | null> = {
  keys: ["console__logs"],
  view: (l) => (JSON.stringify(l) === JSON.stringify(initial) ? null : l),
};
