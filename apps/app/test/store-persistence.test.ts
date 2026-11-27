// spec/app/usage.md, "Story: Meter a request"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Effect, Exit, Layer } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { cutoverMarkerName, postgresStore } from "../src/postgres-store.ts";
import { stateStore, store } from "../src/store.ts";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function tempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function testSchema(name: string) {
  return `kv_test_${name}_${randomUUID().replaceAll("-", "")}`;
}

async function dropSchema(databaseUrl: string, schema: string) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: false });
  try {
    await sql`drop schema if exists ${sql.identifier(schema)} cascade`;
  } finally {
    await sql.end();
  }
}

function usePostgresSchema(databaseUrl: string, name: string) {
  const schema = testSchema(name);
  cleanups.push(() => dropSchema(databaseUrl, schema));
  return schema;
}

interface StoreExercise {
  readonly alphaBefore: string | undefined;
  readonly missing: string | undefined;
  readonly binaryBefore: number[] | undefined;
  readonly sizeBefore: number;
  readonly keysBefore: readonly string[];
  readonly hasAlpha: boolean;
  readonly modified: string | undefined;
  readonly alphaAfter: string | undefined;
  readonly modifiedBinary: number[] | undefined;
  readonly binaryAfter: number[] | undefined;
  readonly alphaRemoved: string | undefined;
  readonly keysAfterPrefix: readonly string[];
  readonly sizeEnd: number;
  readonly isEmptyEnd: boolean;
}

const expectedExercise: StoreExercise = {
  alphaBefore: "one",
  missing: undefined,
  binaryBefore: [0, 1, 250],
  sizeBefore: 4,
  keysBefore: ["alpha", "binary", "prefix-one", "prefix-two"],
  hasAlpha: true,
  modified: "ONE",
  alphaAfter: "ONE",
  modifiedBinary: [0, 1, 250, 7],
  binaryAfter: [0, 1, 250, 7],
  alphaRemoved: undefined,
  keysAfterPrefix: ["binary"],
  sizeEnd: 0,
  isEmptyEnd: true,
};

function byteList(value: Uint8Array | undefined) {
  return value === undefined ? undefined : Array.from(value);
}

async function exerciseStore(layer: Layer.Layer<KeyValueStore.KeyValueStore, unknown, never>): Promise<StoreExercise> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore;
      yield* kv.set("alpha", "one");
      yield* kv.set("prefix-one", "1");
      yield* kv.set("prefix-two", "2");
      yield* kv.set("binary", new Uint8Array([0, 1, 250]));
      const alphaBefore = yield* kv.get("alpha");
      const missing = yield* kv.get("missing");
      const binaryBefore = yield* kv.getUint8Array("binary");
      const sizeBefore = yield* kv.size;
      const keysBefore = [...(yield* kv.keys)].sort();
      const hasAlpha = yield* kv.has("alpha");
      const modified = yield* kv.modify("alpha", (value) => value.toUpperCase());
      const alphaAfter = yield* kv.get("alpha");
      const modifiedBinary = yield* kv.modifyUint8Array("binary", (value) => {
        const next = new Uint8Array(value.length + 1);
        next.set(value);
        next[value.length] = 7;
        return next;
      });
      const binaryAfter = yield* kv.getUint8Array("binary");
      yield* kv.remove("alpha");
      const alphaRemoved = yield* kv.get("alpha");
      yield* kv.clearPrefix("prefix-");
      const keysAfterPrefix = [...(yield* kv.keys)].sort();
      yield* kv.clear;
      const sizeEnd = yield* kv.size;
      const isEmptyEnd = yield* kv.isEmpty;
      return {
        alphaBefore,
        missing,
        binaryBefore: byteList(binaryBefore),
        sizeBefore,
        keysBefore,
        hasAlpha,
        modified,
        alphaAfter,
        modifiedBinary: byteList(modifiedBinary),
        binaryAfter: byteList(binaryAfter),
        alphaRemoved,
        keysAfterPrefix,
        sizeEnd,
        isEmptyEnd,
      };
    }).pipe(Effect.provide(layer)),
  );
}

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (value === undefined) throw new Error("DATABASE_URL is required for PostgreSQL store tests");
  return value;
}

describe("machine state persistence (spec/app/usage.md, \"Story: Meter a request\")", () => {
  it("keeps the file store conformance baseline", async () => {
    expect(await exerciseStore(store(tempDir("sonnely-file-store-")))).toEqual(expectedExercise);
  });

  it("falls back to the file store when DATABASE_URL is absent", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const dir = tempDir("sonnely-fallback-store-");
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const kv = yield* KeyValueStore.KeyValueStore;
          yield* kv.set("fallback-key", "file-value");
        }).pipe(Effect.provide(stateStore(dir))),
      );
      expect(readFileSync(join(dir, "fallback-key"), "utf8")).toBe("file-value");
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });

  async function withEnvironment<A>(env: Record<string, string | undefined>, run: () => A | Promise<A>): Promise<A> {
    const keys = ["DATABASE_URL", "NODE_ENV", "VERCEL_ENV"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      return await run();
    } finally {
      for (const key of keys) {
        const value = original[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("refuses the file fallback in production once PostgreSQL holds the state", async () => {
    const dir = tempDir("sonnely-cutover-refused-");
    writeFileSync(join(dir, cutoverMarkerName), "migrated");
    await withEnvironment({ DATABASE_URL: undefined, NODE_ENV: "production", VERCEL_ENV: undefined }, () => {
      expect(() => stateStore(dir)).toThrow(/stale pre-migration state/);
    });
  });

  it("still boots the file store outside production with the marker present", async () => {
    const dir = tempDir("sonnely-cutover-dev-");
    writeFileSync(join(dir, cutoverMarkerName), "migrated");
    const written = await withEnvironment({ DATABASE_URL: undefined, NODE_ENV: "development", VERCEL_ENV: undefined }, () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const kv = yield* KeyValueStore.KeyValueStore;
          yield* kv.set("dev-key", "dev-value");
          return true;
        }).pipe(Effect.provide(stateStore(dir))),
      ));
    expect({ written, file: readFileSync(join(dir, "dev-key"), "utf8") }).toEqual({ written: true, file: "dev-value" });
  });

  describe("PostgreSQL", () => {
    const itWithDatabase = process.env.DATABASE_URL === undefined ? it.skip : it;

    itWithDatabase("matches the file store behavior", async () => {
      const url = databaseUrl();
      const schema = usePostgresSchema(url, "conformance");
      const postgresResult = await exerciseStore(postgresStore({ databaseUrl: url, migrationDir: tempDir("sonnely-pg-empty-"), schema }));
      const fileResult = await exerciseStore(store(tempDir("sonnely-file-compare-")));
      expect({ postgres: postgresResult, file: fileResult }).toEqual({ postgres: expectedExercise, file: expectedExercise });
    });

    itWithDatabase("imports existing files without overwriting PostgreSQL state", async () => {
      const url = databaseUrl();
      const schema = usePostgresSchema(url, "migration");
      const dir = tempDir("sonnely-pg-migration-");
      writeFileSync(join(dir, "usage"), JSON.stringify({ rows: [{ id: "file-row" }] }));
      writeFileSync(join(dir, "console%3Awallet"), JSON.stringify({ owner: "wallet" }));
      writeFileSync(join(dir, ".write-stale"), JSON.stringify({ stale: true }));
      const setup = postgres(url, { max: 1, onnotice: false });
      try {
        await setup`create schema if not exists ${setup.identifier(schema)}`;
        await setup`
          create table ${setup.identifier(schema, "machine_state")} (
            key text primary key,
            value text not null,
            updated_at timestamptz not null default now()
          )
        `;
        await setup`insert into ${setup.identifier(schema, "machine_state")} (key, value) values (${"usage"}, ${JSON.stringify({ rows: [{ id: "database-row" }] })})`;
      } finally {
        await setup.end();
      }
      const migrated = await Effect.runPromise(
        Effect.gen(function* () {
          const kv = yield* KeyValueStore.KeyValueStore;
          return {
            usage: yield* kv.get("usage"),
            console: yield* kv.get("console:wallet"),
            staging: yield* kv.get(".write-stale"),
          };
        }).pipe(Effect.provide(postgresStore({ databaseUrl: url, migrationDir: dir, schema }))),
      );
      expect(migrated).toEqual({
        usage: JSON.stringify({ rows: [{ id: "database-row" }] }),
        console: JSON.stringify({ owner: "wallet" }),
        staging: undefined,
      });
    });

    itWithDatabase("never resurrects a key deleted from PostgreSQL after the import", async () => {
      const url = databaseUrl();
      const schema = usePostgresSchema(url, "resurrection");
      const dir = tempDir("sonnely-pg-resurrection-");
      writeFileSync(join(dir, "usage"), JSON.stringify({ rows: [{ id: "file-row" }] }));
      writeFileSync(join(dir, "session"), JSON.stringify({ logins: [] }));
      const boot = () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const kv = yield* KeyValueStore.KeyValueStore;
            return { usage: yield* kv.get("usage"), session: yield* kv.get("session") };
          }).pipe(Effect.provide(postgresStore({ databaseUrl: url, migrationDir: dir, schema }))),
        );
      const first = await boot();
      expect(first.usage).toBe(JSON.stringify({ rows: [{ id: "file-row" }] }));
      expect({ original: existsSync(join(dir, "usage")), archived: existsSync(join(dir, "usage.migrated")) }).toEqual({
        original: false,
        archived: true,
      });
      const setup = postgres(url, { max: 1, onnotice: false });
      try {
        await setup`delete from ${setup.identifier(schema, "machine_state")} where key = ${"usage"}`;
      } finally {
        await setup.end();
      }
      const second = await boot();
      expect({ usage: second.usage, session: second.session, markerFile: existsSync(join(dir, cutoverMarkerName)) }).toEqual({
        usage: undefined,
        session: JSON.stringify({ logins: [] }),
        markerFile: true,
      });
    });

    itWithDatabase("refuses a second writer for the same schema", async () => {
      const url = databaseUrl();
      const schema = usePostgresSchema(url, "writer_lock");
      const firstDir = tempDir("sonnely-pg-first-");
      const secondDir = tempDir("sonnely-pg-second-");
      const secondRefused = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(postgresStore({ databaseUrl: url, migrationDir: firstDir, schema }));
            const second = yield* Effect.exit(Effect.scoped(Layer.build(postgresStore({ databaseUrl: url, migrationDir: secondDir, schema }))));
            return Exit.isFailure(second);
          }),
        ),
      );
      expect(secondRefused).toBe(true);
    });
  });
});
