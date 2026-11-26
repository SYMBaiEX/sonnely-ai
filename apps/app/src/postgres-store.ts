import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Layer, Predicate, Result } from "effect";
import { Base64 } from "effect/encoding";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import postgres, { type Sql } from "postgres";

export interface PostgresStoreOptions {
  readonly databaseUrl: string;
  readonly migrationDir: string;
  readonly schema?: string;
}

interface SharedPostgres {
  readonly sql: Sql;
  readonly schema: string;
  readonly migrationDir: string;
  readonly lockKey: bigint;
  ready: Promise<void>;
  references: number;
  lockHeld: boolean;
  lockPromise: Promise<void> | undefined;
  ended: boolean;
}

interface AcquiredPostgres {
  readonly key: string;
  readonly shared: SharedPostgres;
}

const tableName = "machine_state";
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const sharedStores = new Map<string, SharedPostgres>();

function validSchema(schema: string) {
  if (!identifierPattern.test(schema)) throw new Error(`Invalid PostgreSQL schema name ${schema}`);
  return schema;
}

function lockKeyFor(schema: string) {
  return createHash("sha256").update(`sonnely-machine-state:${schema}`).digest().readBigInt64BE(0);
}

function storeError(method: string, key: string | undefined, cause: unknown) {
  return new KeyValueStore.KeyValueStoreError({
    method,
    key,
    message: key === undefined ? `Unable to ${method} in the PostgreSQL key-value store` : `Unable to ${method} item with key ${key}`,
    cause,
  });
}

async function ensureSingleWriter(shared: SharedPostgres) {
  if (shared.lockHeld) return;
  shared.lockPromise ??= (async () => {
    const rows = await shared.sql<{ locked: boolean }[]>`select pg_try_advisory_lock(${shared.lockKey}::bigint) as locked`;
    if (rows[0]?.locked !== true) throw new Error("Another Sonnely instance holds the PostgreSQL machine-state writer lock");
    shared.lockHeld = true;
  })().finally(() => {
    shared.lockPromise = undefined;
  });
  await shared.lockPromise;
}

function decodeFileKey(file: string) {
  try {
    return decodeURIComponent(file);
  } catch {
    return undefined;
  }
}

function missingDirectory(cause: unknown) {
  return Predicate.isObject(cause) && "code" in cause && cause.code === "ENOENT";
}

async function migrationEntries(dir: string) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (cause) {
    if (missingDirectory(cause)) return [];
    throw cause;
  }
  const migrated = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".write-")) continue;
    const key = decodeFileKey(entry.name);
    if (key === undefined) continue;
    migrated.push({ key, value: await readFile(join(dir, entry.name), "utf8") });
  }
  return migrated;
}

async function migrateFiles(shared: SharedPostgres) {
  const entries = await migrationEntries(shared.migrationDir);
  if (entries.length === 0) return;
  await shared.sql.begin(async (sql) => {
    for (const entry of entries) {
      await sql`
        insert into ${sql.identifier(shared.schema, tableName)} (key, value)
        values (${entry.key}, ${entry.value})
        on conflict (key) do nothing
      `;
    }
  });
}

async function initialize(shared: SharedPostgres) {
  await ensureSingleWriter(shared);
  if (shared.schema !== "public") {
    await shared.sql`create schema if not exists ${shared.sql.identifier(shared.schema)}`;
  }
  await shared.sql`
    create table if not exists ${shared.sql.identifier(shared.schema, tableName)} (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `;
  await migrateFiles(shared);
}

function createShared(databaseUrl: string, migrationDir: string, schema: string): SharedPostgres {
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: null,
    max_lifetime: null,
    onnotice: false,
    onclose: () => {
      shared.lockHeld = false;
    },
  });
  const shared: SharedPostgres = {
    sql,
    schema,
    migrationDir,
    lockKey: lockKeyFor(schema),
    ready: Promise.resolve(),
    references: 0,
    lockHeld: false,
    lockPromise: undefined,
    ended: false,
  };
  shared.ready = initialize(shared);
  return shared;
}

async function releaseShared(acquired: AcquiredPostgres) {
  const { key, shared } = acquired;
  shared.references -= 1;
  if (shared.references > 0) return;
  if (sharedStores.get(key) === shared) sharedStores.delete(key);
  if (shared.ended) return;
  shared.ended = true;
  await shared.sql.end().catch(() => undefined);
}

async function acquireShared(options: PostgresStoreOptions): Promise<AcquiredPostgres> {
  const schema = validSchema(options.schema ?? "public");
  const key = JSON.stringify([options.databaseUrl, schema, options.migrationDir]);
  let shared = sharedStores.get(key);
  if (shared === undefined) {
    const created = createShared(options.databaseUrl, options.migrationDir, schema);
    sharedStores.set(key, created);
    shared = created;
  }
  shared.references += 1;
  const acquired = { key, shared };
  try {
    await shared.ready;
    return acquired;
  } catch (cause) {
    await releaseShared(acquired);
    throw cause;
  }
}

function run<A>(shared: SharedPostgres, method: string, key: string | undefined, query: (sql: Sql) => Promise<A>) {
  return Effect.tryPromise({
    try: async () => {
      await shared.ready;
      await ensureSingleWriter(shared);
      return await query(shared.sql);
    },
    catch: (cause) => storeError(method, key, cause),
  });
}

const utf8 = new TextEncoder();

function bytesFromString(value: string) {
  return Result.match(Base64.decode(value), {
    onFailure: () => utf8.encode(value),
    onSuccess: (bytes) => bytes,
  });
}

function makePostgresStore(shared: SharedPostgres) {
  const modifyString = (key: string, f: (value: string) => string) =>
    run(shared, "modify", key, async (sql) =>
      sql.begin(async (tx) => {
        const rows = await tx<{ value: string }[]>`
          select value from ${tx.identifier(shared.schema, tableName)}
          where key = ${key}
          for update
        `;
        const row = rows[0];
        if (row === undefined) return undefined;
        const next = f(row.value);
        await tx`
          update ${tx.identifier(shared.schema, tableName)}
          set value = ${next}, updated_at = now()
          where key = ${key}
        `;
        return next;
      }));

  return KeyValueStore.makeStringOnly({
    get: (key) =>
      run(shared, "get", key, async (sql) => {
        const rows = await sql<{ value: string }[]>`
          select value from ${sql.identifier(shared.schema, tableName)}
          where key = ${key}
        `;
        return rows[0]?.value;
      }),
    set: (key, value) =>
      run(shared, "set", key, async (sql) => {
        await sql`
          insert into ${sql.identifier(shared.schema, tableName)} (key, value)
          values (${key}, ${value})
          on conflict (key) do update
          set value = excluded.value, updated_at = now()
        `;
      }),
    remove: (key) =>
      run(shared, "remove", key, async (sql) => {
        await sql`
          delete from ${sql.identifier(shared.schema, tableName)}
          where key = ${key}
        `;
      }),
    clear: run(shared, "clear", undefined, async (sql) => {
      await sql`delete from ${sql.identifier(shared.schema, tableName)}`;
    }),
    clearPrefix: (prefix) =>
      run(shared, "clearPrefix", prefix, async (sql) => {
        await sql`
          delete from ${sql.identifier(shared.schema, tableName)}
          where starts_with(key, ${prefix})
        `;
      }),
    size: run(shared, "size", undefined, async (sql) => {
      const rows = await sql<{ count: number }[]>`
        select count(*)::int as count from ${sql.identifier(shared.schema, tableName)}
      `;
      return rows[0]?.count ?? 0;
    }),
    keys: run(shared, "keys", undefined, async (sql) => {
      const rows = await sql<{ key: string }[]>`
        select key from ${sql.identifier(shared.schema, tableName)}
      `;
      return rows.map((row) => row.key);
    }),
    modify: modifyString,
    modifyUint8Array: (key, f) =>
      run(shared, "modifyUint8Array", key, async (sql) =>
        sql.begin(async (tx) => {
          const rows = await tx<{ value: string }[]>`
            select value from ${tx.identifier(shared.schema, tableName)}
            where key = ${key}
            for update
          `;
          const row = rows[0];
          if (row === undefined) return undefined;
          const next = f(bytesFromString(row.value));
          await tx`
            update ${tx.identifier(shared.schema, tableName)}
            set value = ${Base64.encode(next)}, updated_at = now()
            where key = ${key}
          `;
          return next;
        })),
  });
}

export function postgresStore(options: PostgresStoreOptions) {
  return Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.gen(function* () {
      const acquired = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => acquireShared(options),
          catch: (cause) => storeError("connect", undefined, cause),
        }),
        (acquired) => Effect.promise(() => releaseShared(acquired)),
      );
      return makePostgresStore(acquired.shared);
    }),
  );
}
