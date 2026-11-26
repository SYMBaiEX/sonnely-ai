import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigProvider, Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import { healthApi } from "../src/api/health.vibe";
import { store } from "../src/serve.vibe";

const billingEnv = {
  SOLANA_BILLING_CLUSTER: "mainnet",
  SOLANA_TREASURY: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  SOLANA_RPC_URL: "https://rpc.example.test",
};

const cleanups: Array<() => void | Promise<void>> = [];

function makeHealthApi(env: Record<string, string>) {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-health-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const appLayer = Layer.provideMerge(healthApi, store(dir)).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
    Layer.provideMerge(Layer.succeed(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env))),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return { handler: app.handler, dir };
}

interface ReadyBody {
  ok: boolean;
  checks: Record<string, boolean>;
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("health and readiness", () => {
  it("answers shallow liveness without any checks", async () => {
    const { handler } = makeHealthApi({});
    const response = await handler(new Request("http://localhost/api/health"));
    expect({ status: response.status, body: (await response.json()) as unknown }).toEqual({
      status: 200,
      body: { ok: true, service: "sonnely" },
    });
  });

  it("is ready when the store writes, states decode and billing is configured", async () => {
    const { handler } = makeHealthApi(billingEnv);
    const response = await handler(new Request("http://localhost/api/ready"));
    const body = await response.json() as ReadyBody;
    expect({ status: response.status, ok: body.ok, checks: body.checks }).toEqual({
      status: 200,
      ok: true,
      checks: { store: true, ledger: true, session: true, admin: true, billingConfig: true },
    });
  });

  it("is unready when a critical machine state does not decode", async () => {
    const { handler, dir } = makeHealthApi(billingEnv);
    writeFileSync(join(dir, "session"), "not json at all");
    const response = await handler(new Request("http://localhost/api/ready"));
    const body = await response.json() as ReadyBody;
    expect({ status: response.status, ok: body.ok, session: body.checks.session, ledger: body.checks.ledger }).toEqual({
      status: 503,
      ok: false,
      session: false,
      ledger: true,
    });
  });

  it("is unready when billing is not configured", async () => {
    const { handler } = makeHealthApi({});
    const response = await handler(new Request("http://localhost/api/ready"));
    const body = await response.json() as ReadyBody;
    expect({ status: response.status, ok: body.ok, billingConfig: body.checks.billingConfig, store: body.checks.store }).toEqual({
      status: 503,
      ok: false,
      billingConfig: false,
      store: true,
    });
  });
});
