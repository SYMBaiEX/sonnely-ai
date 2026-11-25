// spec/app/admin/index.md against the stored admin machine, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__admin.conformance.ts";
import type { Machine } from "../../gen/app__admin.effect.vibe";
import type { Registry, Event } from "../../gen/app__admin.ts";
import { admin, dispatch } from "../../src/api/admin.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input` from `by`: a refusal by the rules or the decoders is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown, by?: unknown) =>
  dispatch(input, by).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused, NotASender: refused }),
  );

/** The registry as stored; nothing kept reads as nothing. */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("admin")), (found) =>
    found === undefined ? null : (JSON.parse(found) as Registry));

export const driver = effectDriver<Event, Registry | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(admin, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

const untouched = (a: Registry) => a.records.length === 0 && a.audit.length === 0 && a.ops.roster.length === 0;
/** One registry, so one key; the initial registry is the empty store. */
export const options: Options<Registry | null> = { keys: ["admin"], view: (a) => (untouched(a) ? null : a) };
