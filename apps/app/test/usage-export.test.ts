// spec/app/usage.md, "Rows are never removed and settled rows never change": the UsageMax
// export downloads the requesting wallet's own settled rows as a JSON file.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Session from "../gen/app__session.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { usageApi } from "../src/api/usage.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { store } from "../src/serve.vibe";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const tokenA = "usage-export-session-a";
const cleanups: Array<() => void | Promise<void>> = [];

function row(id: string, wallet: string, status: string, time: number) {
  return {
    id, time, keyName: "key", keyId: "", project: "", wallet, model: "deepseek-ai/DeepSeek-V4.1",
    provider: "NearAI", input: 10, output: 5, cached: -1, cost: 100, providerMs: 40, status,
  };
}

function makeApp() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-usage-export-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const now = Date.now();
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(tokenA), nonce: "nonce", wallet: walletA, createdAt: 1, expiresAt: now + 60_000, state: "LoginActive" },
    ],
  }));
  writeFileSync(join(dir, "usage"), JSON.stringify({
    rows: [
      row("settled-recent", walletA, "Complete", now - 86_400_000),
      row("settled-old", walletA, "Complete", now - 45 * 86_400_000),
      { ...row("held", walletA, "Pending", now - 1000), input: 0, output: 0, providerMs: -1 },
      row("failed", walletA, "Failed", now - 2000),
      row("other-wallet", walletB, "Complete", now - 1000),
    ],
  }));
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const state = Layer.provideMerge(
    Layer.mergeAll(Usage.stored("usage"), Session.stored("session")),
    store(dir),
  );
  const appLayer = Layer.provideMerge(usageApi, state).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return app.handler;
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("usage-max export", () => {
  it("downloads only the requesting wallet's settled rows inside the requested range", async () => {
    const handler = makeApp();
    const response = await handler(new Request("http://localhost/api/sonnely/usage-max?days=30", { headers: { cookie: "sonnely_session=" + tokenA } }));
    const body = await response.json() as { rows: { id: string }[] };
    expect({
      status: response.status,
      disposition: response.headers.get("content-disposition"),
      ids: body.rows.map((r) => r.id),
    }).toEqual({
      status: 200,
      disposition: "attachment; filename=\"sonnely-usage-max-" + new Date().toISOString().slice(0, 10) + ".json\"",
      ids: ["settled-recent"],
    });
  });

  it("posts the same export and refuses anonymous readers", async () => {
    const handler = makeApp();
    const posted = await handler(new Request("http://localhost/api/sonnely/usage-max", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "sonnely_session=" + tokenA },
      body: JSON.stringify({ token: "collector-key", device: "device", days: 90 }),
    }));
    const body = await posted.json() as { rows: { id: string }[] };
    const anon = await handler(new Request("http://localhost/api/sonnely/usage-max"));
    expect({
      status: posted.status,
      ids: body.rows.map((r) => r.id),
      anonStatus: anon.status,
    }).toEqual({
      status: 200,
      ids: ["settled-recent", "settled-old"],
      anonStatus: 401,
    });
  });
});
