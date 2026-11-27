// spec/app/session.md, "Story: Sign in with a wallet"; spec/app/billing/deposits.md, "Story: Open a payment intent"
import { Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import { afterEach, describe, expect, it } from "vitest";
import { ratelimitApi } from "../src/api/ratelimit.vibe";
import * as Session from "../gen/app__session.effect.vibe";
import { sessionDigest } from "../src/api/session/signin.ts";

const cleanups: Array<() => void | Promise<void>> = [];
const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const tokenA = "rate-limit-session-a";
const tokenB = "rate-limit-session-b";

function sessionLayer() {
  const expiresAt = Date.now() + 60_000;
  return Session.machine({
    challenges: [],
    logins: [
      { digest: sessionDigest(tokenA), nonce: "nonce-a", wallet: walletA, createdAt: 1, expiresAt, state: "LoginActive" },
      { digest: sessionDigest(tokenB), nonce: "nonce-b", wallet: walletB, createdAt: 1, expiresAt, state: "LoginActive" },
    ],
  });
}

function makeApi() {
  const scheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));
  const ok = HttpServerResponse.json({ ok: true });
  const routes = Layer.mergeAll(
    ratelimitApi,
    sessionLayer(),
    HttpRouter.add("POST", "/api/session/challenge", ok),
    HttpRouter.add("POST", "/api/session/verify", ok),
    HttpRouter.add("POST", "/api/billing/deposits", ok),
    HttpRouter.add("POST", "/api/billing/deposits/prepare", ok),
    HttpRouter.add("POST", "/api/billing/intents/quote", ok),
    HttpRouter.add("POST", "/api/machines/console", ok),
    HttpRouter.add("GET", "/api/machines/site", ok),
  );
  const appLayer = routes.pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(scheduler),
  );
  const app = HttpRouter.toWebHandler(appLayer);
  cleanups.push(() => app.dispose());
  return app.handler;
}

function post(path: string, ip?: string, token?: string) {
  const headers: Record<string, string> = {};
  if (ip != undefined) headers["x-forwarded-for"] = ip;
  if (token != undefined) headers.cookie = "sonnely_session=" + token;
  return new Request("http://localhost" + path, { method: "POST", headers });
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("rate limiting", () => {
  it("allows ten challenge requests a minute and refuses the eleventh", async () => {
    const handler = makeApi();
    const ip = "203.0.113.7";
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await handler(post("/api/session/challenge", ip));
      if (response.status != 200) throw new Error("attempt " + attempt + " was throttled early: " + response.status);
    }
    const refused = await handler(post("/api/session/challenge", ip));
    expect({ status: refused.status, retryAfter: refused.headers.get("retry-after") != null }).toEqual({
      status: 429,
      retryAfter: true,
    });
  });

  it("counts each ip and each bucket apart", async () => {
    const handler = makeApi();
    const ip = "203.0.113.8";
    for (let attempt = 0; attempt < 10; attempt++) await handler(post("/api/session/challenge", ip));
    const otherIp = await handler(post("/api/session/challenge", "203.0.113.9"));
    const otherBucket = await handler(post("/api/billing/deposits", ip));
    expect({ otherIp: otherIp.status, otherBucket: otherBucket.status }).toEqual({ otherIp: 200, otherBucket: 200 });
  });

  it("throttles deposit creation", async () => {
    const handler = makeApi();
    const ip = "203.0.113.10";
    for (let attempt = 0; attempt < 10; attempt++) await handler(post("/api/billing/deposits", ip));
    const refused = await handler(post("/api/billing/deposits/prepare", ip));
    expect(refused.status).toBe(429);
  });

  it("leaves reads and other paths alone", async () => {
    const handler = makeApi();
    const ip = "203.0.113.11";
    for (let attempt = 0; attempt < 12; attempt++) await handler(post("/api/session/challenge", ip));
    const read = await handler(new Request("http://localhost/api/machines/site", { headers: { "x-forwarded-for": ip } }));
    expect(read.status).toBe(200);
  });

  it("counts the last x-forwarded-for hop, so prepended spoofs share one budget", async () => {
    const handler = makeApi();
    const real = "198.51.100.7";
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await handler(post("/api/session/challenge", attempt % 2 == 0 ? "10.0.0.1, " + real : "10.0.0.2, " + real));
      if (response.status != 200) throw new Error("attempt " + attempt + " was throttled early: " + response.status);
    }
    const spoofed = await handler(post("/api/session/challenge", "10.0.0.3, " + real));
    const otherReal = await handler(post("/api/session/challenge", "10.0.0.3, 198.51.100.8"));
    expect({ spoofed: spoofed.status, otherReal: otherReal.status }).toEqual({ spoofed: 429, otherReal: 200 });
  });

  it("throttles session verification like the challenge", async () => {
    const handler = makeApi();
    const ip = "203.0.113.12";
    for (let attempt = 0; attempt < 10; attempt++) await handler(post("/api/session/verify", ip));
    const refused = await handler(post("/api/session/verify", ip));
    expect(refused.status).toBe(429);
  });

  it("throttles machine writes past their generous budget", async () => {
    const handler = makeApi();
    const ip = "203.0.113.13";
    for (let attempt = 0; attempt < 120; attempt++) {
      const response = await handler(post("/api/machines/console", ip));
      if (response.status != 200) throw new Error("attempt " + attempt + " was throttled early: " + response.status);
    }
    const refused = await handler(post("/api/machines/console", ip));
    expect(refused.status).toBe(429);
  });

  it("throttles intent quotes by wallet across source addresses", async () => {
    const handler = makeApi();
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await handler(post("/api/billing/intents/quote", attempt % 2 == 0 ? "203.0.113.20" : "203.0.113.21", tokenA));
      if (response.status != 200) throw new Error("attempt " + attempt + " was throttled early: " + response.status);
    }
    const sameWallet = await handler(post("/api/billing/intents/quote", "203.0.113.22", tokenA));
    const otherWallet = await handler(post("/api/billing/intents/quote", "203.0.113.20", tokenB));
    expect({ sameWallet: sameWallet.status, otherWallet: otherWallet.status }).toEqual({ sameWallet: 429, otherWallet: 200 });
  });

  it("uses the source address for intent quotes without a session", async () => {
    const handler = makeApi();
    const ip = "203.0.113.23";
    for (let attempt = 0; attempt < 30; attempt++) await handler(post("/api/billing/intents/quote", ip));
    const sameIp = await handler(post("/api/billing/intents/quote", ip));
    const otherIp = await handler(post("/api/billing/intents/quote", "203.0.113.24"));
    expect({ sameIp: sameIp.status, otherIp: otherIp.status }).toEqual({ sameIp: 429, otherIp: 200 });
  });
});
