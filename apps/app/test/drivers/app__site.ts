// SPEC.md, "Conformance": spec/app/site/index.md against the stored board of api/site.vibe, read through its Machine.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__site.conformance.ts";
import type { Machine } from "../../gen/app__site.effect.vibe";
import type { Board, Event } from "../../gen/app__site.ts";
import { board, dispatch, site } from "../../src/api/site.vibe";

const refused = () => Effect.succeed("refused" as const);
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

const observe = () => board();

export const driver = effectDriver<Event, Board, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(site, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

export const options: Options<Board> = { keys: ["site"] };
