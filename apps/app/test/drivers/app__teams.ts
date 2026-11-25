// SPEC.md, "Conformance": spec/app/teams.md against the application's stored machine, observed as what the store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__teams.conformance.ts";
import type { Machine } from "../../gen/app__teams.effect.vibe";
import type { Event, Teams } from "../../gen/app__teams.ts";
import { dispatch, teams } from "../../src/api/teams.vibe";

const refused = () => Effect.succeed("refused" as const);
/** A refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The directory as stored; an empty directory reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("teams")), (found) =>
    found === undefined ? null : (JSON.parse(found) as Teams),
  );

export const driver = effectDriver<Event, Teams | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(teams, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One directory, so one key; the initial directory is the empty store. */
export const options: Options<Teams | null> = { keys: ["teams"], view: (s) => (s.teams.length === 0 ? null : s) };
