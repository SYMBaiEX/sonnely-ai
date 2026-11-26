// spec/app/usage.md, "Rows are never removed and settled rows never change"
import { Effect } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { store } from "../src/store.ts";

const [dir, writerId, iterations] = process.argv.slice(2);
const writes = Number(iterations);

for (let seq = 0; seq < writes; seq++) {
  await Effect.runPromise(
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore;
      const found = yield* kv.get("usage").pipe(Effect.catch(() => Effect.succeed(undefined)));
      const rows: unknown[] = found === undefined ? [] : (JSON.parse(found) as { rows: unknown[] }).rows;
      rows.push({ writer: Number(writerId), seq, pad: "x".repeat(400) });
      yield* kv.set("usage", JSON.stringify({ rows }));
    }).pipe(Effect.provide(store(dir))),
  );
}
