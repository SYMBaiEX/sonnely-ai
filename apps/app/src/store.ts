import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { Effect, Layer } from "effect";
import { layer as pathLayer } from "effect/Path";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { cutoverMarkerName, postgresStore } from "./postgres-store.ts";

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

function productionEnvironment() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/** Once PostgreSQL has taken over, the files are frozen pre-migration state: booting against them
 * silently rolls production back, so the cutover marker refuses the boot instead. Outside
 * production the fallback stays available for local scratch data. */
function guardCutover(dir: string) {
  if (!productionEnvironment() || !existsSync(join(dir, cutoverMarkerName))) return;
  throw new Error(
    `Refusing to start: ${join(dir, cutoverMarkerName)} shows this deployment's state moved to PostgreSQL, ` +
      "but DATABASE_URL is not set. Booting the file store would serve stale pre-migration state. " +
      "Restore DATABASE_URL, or remove the marker and data directory only if rolling back to the files is intended.",
  );
}

export function stateStore(dir: string): Layer.Layer<KeyValueStore.KeyValueStore, unknown, never> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl !== "") return postgresStore({ databaseUrl, migrationDir: dir });
  guardCutover(dir);
  return store(dir);
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
