// SPEC.md, "Conformance": spec/app/nav.md against the shell of src/web/nav.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__nav.conformance.ts";
import type { Machine } from "../../gen/app__nav.effect.vibe";
import type { Event, Nav } from "../../gen/app__nav.ts";
import { dispatch, nav } from "../../src/web/nav.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  dispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The navigator as stored; the initial page and empty back stack read as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("nav2")), (found) => {
    const n = found === undefined ? null : (JSON.parse(found) as Nav);
    return n === null || (n.back.length === 0 && n.page.tag === "Home") ? null : n;
  });

export const driver = effectDriver<Event, Nav | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(nav, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One navigator, so one key; the initial navigator is the empty store. */
export const options: Options<Nav | null> = { keys: ["nav"], view: (n) => (n.back.length === 0 && n.page.tag === "Home" ? null : n) };
