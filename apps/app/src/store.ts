import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { Effect, Layer } from "effect";
import { layer as pathLayer } from "effect/Path";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { postgresStore } from "./postgres-store.ts";

function setAtomically(dir: string, key: string, value: string | Uint8Array) {
  return Effect.tryPromise({
    try: async () => {
      const staging = join(dir, `.write-${randomUUID()}`);
      try {
        await writeFile(staging, value);
        await rename(staging, join(dir, encodeURIComponent(key)));
      } catch (error) {
        await unlink(staging).catch(() => undefined);
        throw error;
      }
    },
    catch: (cause) => new KeyValueStore.KeyValueStoreError({ method: "set", key, message: `Unable to set item with key ${key}`, cause }),
  });
}

export function stateStore(dir: string): Layer.Layer<KeyValueStore.KeyValueStore, unknown, never> {
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl === undefined || databaseUrl === "" ? store(dir) : postgresStore({ databaseUrl, migrationDir: dir });
}

export function store(dir: string) {
  const base = Layer.provide(KeyValueStore.layerFileSystem(dir), Layer.merge(NodeFileSystem.layer, pathLayer));
  const atomic = Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.map(
      Effect.gen(function* () {
        return yield* KeyValueStore.KeyValueStore;
      }),
      (kv) =>
        KeyValueStore.make({
          get: kv.get,
          getUint8Array: kv.getUint8Array,
          set: (key, value) => (key.length === 0 || key === "." || key === ".." ? kv.set(key, value) : setAtomically(dir, key, value)),
          remove: kv.remove,
          clear: kv.clear,
          clearPrefix: kv.clearPrefix,
          size: kv.size,
          keys: kv.keys,
        }),
    ),
  );
  return Layer.provide(atomic, base);
}
