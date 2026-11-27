// spec/app/site/index.md, "Story: Check the service status"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import * as Admin from "../gen/app__admin.effect.vibe";
import * as Session from "../gen/app__session.effect.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";
import { site, siteApi } from "../src/api/site.vibe";
import { store } from "../src/serve.vibe";

const operator = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const outsider = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const operatorToken = "site-operator-session";
const outsiderToken = "site-outsider-session";
const cleanups: Array<() => void | Promise<void>> = [];

function writeState(dir: string) {
  writeFileSync(join(dir, "session"), JSON.stringify({
    challenges: [],
    logins: [
      { digest: sessionDigest(operatorToken), nonce: "nonce", wallet: operator, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
      { digest: sessionDigest(outsiderToken), nonce: "nonce", wallet: outsider, createdAt: 1, expiresAt: Date.now() + 60_000, state: "LoginActive" },
    ],
  }));
  writeFileSync(join(dir, "admin"), JSON.stringify({
    ops: { roster: [{ wallet: operator, role: "Admin" }] },
    records: [],
    audit: [],
  }));
}

function makeSiteApi() {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-site-api-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeState(dir);
  const stateLayer = Layer.provideMerge(
    Layer.mergeAll(Admin.stored("admin"), Session.stored("session"), site),
    store(dir),
  );
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const appLayer = Layer.provideMerge(siteApi, stateLayer).pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return app.handler;
}

function probe(token?: string) {
  return new Request("http://localhost/api/site/status", {
    method: "POST",
    headers: token == undefined ? {} : { cookie: "sonnely_session=" + token },
  });
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  delete process.env.SONNELY_DEPOSIT_RECOVERY;
});

describe("site status probes", () => {
  // spec/app/site/index.md, "The board waits for its first report, then shows the latest"
  it("keeps the machine read public", async () => {
    const handler = makeSiteApi();
    const response = await handler(new Request("http://localhost/api/machines/site"));
    expect(response.status).toBe(200);
  });

  it("refuses an anonymous probe request", async () => {
    const handler = makeSiteApi();
    const response = await handler(probe());
    expect(response.status).toBe(401);
  });

  it("refuses a signed-in wallet that is not an operator", async () => {
    const handler = makeSiteApi();
    const response = await handler(probe(outsiderToken));
    expect(response.status).toBe(403);
  });

  it("lets an operator ask for a fresh probe", async () => {
    delete process.env.SONNELY_DEPOSIT_RECOVERY;
    const handler = makeSiteApi();
    const response = await handler(probe(operatorToken));
    const body = await response.json() as { tag: string; report?: { recoveryUp: boolean } };
    expect({ status: response.status, recoveryUp: body.report?.recoveryUp }).toEqual({ status: 200, recoveryUp: true });
  });

  it("probes by itself in the background without anyone asking", async () => {
    const handler = makeSiteApi();
    const response = await handler(new Request("http://localhost/api/machines/site/stream"));
    if (!response.body) throw new Error("no stream");
    let received = "";
    const decoder = new TextDecoder();
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      received += decoder.decode(chunk);
      if (received.includes('"tag":"Live"') || received.length > 100_000) break;
    }
    expect(received).toContain('"tag":"Live"');
  });
});
