// spec/app/console/chat.md against the shell of src/api/console/chat.vibe, observed as what its store holds.
import { Effect, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { effectDriver } from "vibestack/testing";
import type { Options } from "../../gen/app__console__chat.conformance.ts";
import type { Machine } from "../../gen/app__console__chat.effect.vibe";
import type { Chat, Event } from "../../gen/app__console__chat.ts";
import { chatDispatch, chatStore, initial } from "../../src/api/console/chat.vibe";

const refused = () => Effect.succeed("refused" as const);
/** What the shell did with `input`: a refusal by the rules or the decoder is "refused", any other failure stays one. */
const receive = (_key: string, input: unknown) =>
  chatDispatch(input).pipe(
    Effect.map(() => "accepted" as const),
    Effect.catchTags({ Rejected: refused, NotAnEvent: refused }),
  );

/** The stored playground; an untouched one reads as "nothing kept". */
const observe = () =>
  Effect.map(KeyValueStore.KeyValueStore.use((store) => store.get("console__chat")), (found) => {
    if (found === undefined) {
      return null;
    }
    const c = JSON.parse(found) as Chat;
    return JSON.stringify(c) === JSON.stringify(initial) ? null : c;
  });

export const driver = effectDriver<Event, Chat | null, Machine | KeyValueStore.KeyValueStore, unknown>(
  Layer.provideMerge(chatStore, KeyValueStore.layerMemory),
  { dispatch: receive, receive, observe },
);

/** One playground, so one key; the untouched playground is the empty store. */
export const options: Options<Chat | null> = {
  keys: ["console__chat"],
  view: (c) => (JSON.stringify(c) === JSON.stringify(initial) ? null : c),
};
