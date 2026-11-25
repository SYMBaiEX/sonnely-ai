// SPEC.md, "Conformance": spec/app/models.md against the filter machine the catalog page runs, read through its Machine.
import { Effect } from "effect";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__models.conformance.ts";
import type { Machine } from "../../gen/app__models.effect.vibe";
import type { CatalogFilter, Event } from "../../gen/app__models.ts";
import { filterDispatch, filterMachine, filterObserve } from "../../src/web/areas/site/filter.ts";

const refused = () => Effect.succeed("refused" as const);
const receive = (_key: string, input: unknown) =>
  filterDispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

const observe = () => filterObserve();

export const driver = effectDriver<Event, CatalogFilter, Machine, unknown>(filterMachine, {
  dispatch: receive,
  receive,
  observe,
});

export const options: Options<CatalogFilter> = { keys: ["catalog"] };
