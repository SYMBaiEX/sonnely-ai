import { createHash } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Effect, Exit, Layer, Scope } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import * as Ledger from "../gen/app__billing__ledger.effect.vibe";
import * as Requests from "../gen/app__gateway__requests.effect.vibe";
import * as WorkspaceKeys from "../gen/app__keys.effect.vibe";
import * as Session from "../gen/app__session.effect.vibe";
import * as Teams from "../gen/app__teams.effect.vibe";
import * as Usage from "../gen/app__usage.effect.vibe";
import { realtime } from "../src/api/realtime.vibe";

const realtimeUpstream = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("../src/api/gateway/providers.ts", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, openRealtimeUpstream: realtimeUpstream.open };
});

const wallet = "realtime-test-wallet";
const bearer = "realtime-test-secret";
const bearerHash = createHash("sha256").update(bearer).digest("hex");

let stateInstance = 0;

const stateLayer = () => {
  const instance = ++stateInstance;
  return Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceKeys.stored(`realtime-test-keys-${instance}`),
      Teams.stored(`realtime-test-teams-${instance}`),
      Ledger.stored(`realtime-test-ledger-${instance}`),
      Usage.stored(`realtime-test-usage-${instance}`),
      Requests.stored(`realtime-test-requests-${instance}`),
      Session.stored(`realtime-test-session-${instance}`),
    ),
    KeyValueStore.layerMemory,
  );
}

type GatewayRuntime = {
  server: Server;
  scope: Scope.Closeable;
  wss: WebSocketServer;
  port: number;
  keys: WorkspaceKeys.Machine.Shape;
  ledger: Ledger.Machine.Shape;
  usage: Usage.Machine.Shape;
  requests: Requests.Machine.Shape;
};

const listen = (server: Server) =>
  new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });

async function startGateway() {
  const program = Effect.gen(function* () {
    const keys = yield* WorkspaceKeys.Machine;
    const ledger = yield* Ledger.Machine;
    const usage = yield* Usage.Machine;
    const requests = yield* Requests.Machine;
    const scope = yield* Scope.make();
    const app = realtime();
    const handler = yield* NodeHttpServer.makeHandler(app, { scope });
    const wss = new WebSocketServer({ noServer: true });
    const upgradeHandler = yield* NodeHttpServer.makeUpgradeHandler(Effect.succeed(wss), app, { scope });
    const server = createServer();
    server.on("request", (request, response) => handler(request, response));
    server.on("upgrade", (request, socket, head) => upgradeHandler(request, socket, head));
    const port = yield* Effect.promise(() => listen(server));
    return { server, scope, wss, port, keys, ledger, usage, requests } satisfies GatewayRuntime;
  });
  return Effect.runPromise(program.pipe(Effect.provide(stateLayer())));
}

async function stopGateway(runtime: GatewayRuntime) {
  await Effect.runPromise(Scope.close(runtime.scope, Exit.void));
  runtime.server.closeAllConnections();
  await new Promise<void>((resolve, reject) => runtime.server.close((error) => error ? reject(error) : resolve()));
  runtime.wss.close();
}

async function createInferenceKey(keys: WorkspaceKeys.Machine.Shape) {
  await Effect.runPromise(keys.send(
    {
      type: "create",
      id: "realtime-key",
      label: "Realtime",
      prefix: "sonnely_live_realtime",
      hash: bearerHash,
      project: "",
      scopes: ["inference"],
      cap: 0,
      dailyCap: 0,
      expiresAt: 0,
      now: 1,
    },
    wallet,
  ));
}

function upgradeRequest(port: number, authorization?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const key = Buffer.alloc(16, 1).toString("base64");
    const outgoing = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/api/sonnely/v1/realtime?model=voxtral-mini-4b-realtime",
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": key,
        "sec-websocket-version": "13",
        ...(authorization ? { authorization } : {}),
      },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => body += chunk);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.TINFOIL_API_KEY;
});

describe("gateway realtime", () => {
  // spec/app/gateway/realtime.md, "Story: Run a metered realtime transcription"
  it("refuses an unauthenticated upgrade before opening a meter", async () => {
    const gateway = await startGateway();
    try {
      const response = await upgradeRequest(gateway.port);
      expect(response.status).toBe(401);
      expect(response.body).toContain("bearer key or signed-in console session");
      expect((await Effect.runPromise(gateway.usage.get())).rows).toHaveLength(0);
      expect((await Effect.runPromise(gateway.requests.get())).requests).toHaveLength(0);
    } finally {
      await stopGateway(gateway);
    }
  });

  // spec/app/gateway/realtime.md, "Story: Run a metered realtime transcription"
  it("refuses the upgrade honestly when no realtime provider is configured", async () => {
    const gateway = await startGateway();
    try {
      await createInferenceKey(gateway.keys);
      const response = await upgradeRequest(gateway.port, "Bearer " + bearer);
      expect(response.status).toBe(503);
      expect(response.body).toContain("awaiting provider activation");
      expect((await Effect.runPromise(gateway.usage.get())).rows).toHaveLength(0);
      expect((await Effect.runPromise(gateway.requests.get())).requests).toHaveLength(0);
    } finally {
      await stopGateway(gateway);
    }
  });

  // spec/app/gateway/realtime.md, "Story: Run a metered realtime transcription"
  it("bridges committed audio upstream and settles 15 micro-USD for 6400 PCM bytes", async () => {
    process.env.TINFOIL_API_KEY = "provider-secret";
    const upstreamEvents: Record<string, unknown>[] = [];
    const upstream = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => upstream.on("listening", resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    upstream.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "session.created" }));
      socket.on("message", (data) => {
        const event = JSON.parse((data as Buffer).toString("utf8")) as Record<string, unknown>;
        upstreamEvents.push(event);
        if (event.type === "input_audio_buffer.commit" && event.final === true) {
          socket.send(JSON.stringify({ type: "transcription.delta", delta: "transcribed " }));
          socket.send(JSON.stringify({ type: "transcription.done", text: "transcribed hello" }));
        }
      });
    });
    realtimeUpstream.open.mockImplementation(() => Promise.resolve(new WebSocket("ws://127.0.0.1:" + upstreamPort)));

    const gateway = await startGateway();
    try {
      await createInferenceKey(gateway.keys);
      await Effect.runPromise(gateway.ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 }));
      const messages: Record<string, unknown>[] = [];
      const closed = new Promise<number>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${gateway.port}/api/sonnely/v1/realtime?model=voxtral-mini-4b-realtime`, {
          headers: { authorization: "Bearer " + bearer },
        });
        client.on("message", (data) => {
          const event = JSON.parse((data as Buffer).toString("utf8")) as Record<string, unknown>;
          messages.push(event);
          if (event.type === "session.created") {
            client.send(JSON.stringify({ type: "session.update", model: "voxtral-mini-4b-realtime" }));
            client.send(JSON.stringify({ type: "input_audio_buffer.append", audio: Buffer.alloc(6_400).toString("base64") }));
            client.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          }
        });
        client.on("close", resolve);
        client.on("error", reject);
      });
      const closeCode = await closed;
      expect(closeCode).toBe(1_000);
      expect(messages.some((event) => event.type === "session.created")).toBe(true);
      expect(messages.some((event) => event.type === "transcription.delta" && event.delta === "transcribed ")).toBe(true);
      const done = messages.find((event) => event.type === "transcription.done");
      expect(done).toMatchObject({ text: "transcribed hello" });
      expect(typeof done?.sonnely_request_id).toBe("string");
      expect(upstreamEvents).toContainEqual({ type: "session.update", model: "voxtral-mini-4b-realtime" });
      expect(upstreamEvents).toContainEqual({ type: "input_audio_buffer.commit" });
      expect(upstreamEvents.some((event) => event.type === "input_audio_buffer.append")).toBe(true);
      expect(upstreamEvents).toContainEqual({ type: "input_audio_buffer.commit", final: true });

      const rows = (await Effect.runPromise(gateway.usage.get())).rows;
      const requests = (await Effect.runPromise(gateway.requests.get())).requests;
      const ledgerRows = (await Effect.runPromise(gateway.ledger.get())).entries;
      const key = (await Effect.runPromise(gateway.keys.get())).keys[0];
      expect(rows[0]).toMatchObject({ model: "voxtral-mini-4b-realtime", provider: "Tinfoil", cost: 15, status: "Complete" });
      expect(requests[0]).toMatchObject({ endpoint: "Realtime", model: "voxtral-mini-4b-realtime", status: "Complete", charged: 15 });
      expect(key?.spent).toBe(15);
      expect(ledgerRows.some((entry) => entry.kind === "Charge" && entry.amount === 15)).toBe(true);
      expect(ledgerRows.some((entry) => entry.kind === "Release" && entry.amount === 2_200)).toBe(true);
    } finally {
      await stopGateway(gateway);
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  }, 10_000);

  // spec/app/gateway/realtime.md, "Story: Run a metered realtime transcription"
  it("settles committed audio exactly once when the client disconnects", async () => {
    process.env.TINFOIL_API_KEY = "provider-secret";
    const upstream = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => upstream.on("listening", resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    upstream.on("connection", (socket) => socket.send(JSON.stringify({ type: "session.created" })));
    realtimeUpstream.open.mockImplementation(() => Promise.resolve(new WebSocket("ws://127.0.0.1:" + upstreamPort)));

    const gateway = await startGateway();
    try {
      await createInferenceKey(gateway.keys);
      await Effect.runPromise(gateway.ledger.send({ type: "credit", wallet, detail: "deposit", amount: 100_000 }));
      const closed = new Promise<number>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${gateway.port}/api/sonnely/v1/realtime?model=voxtral-mini-4b-realtime`, {
          headers: { authorization: "Bearer " + bearer },
        });
        client.on("message", (data) => {
          const event = JSON.parse((data as Buffer).toString("utf8")) as Record<string, unknown>;
          if (event.type === "session.created") {
            client.send(JSON.stringify({ type: "input_audio_buffer.append", audio: Buffer.alloc(6_400).toString("base64") }));
            client.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
            client.close();
          }
        });
        client.on("close", resolve);
        client.on("error", reject);
      });
      await closed;
      let rows = (await Effect.runPromise(gateway.usage.get())).rows;
      await vi.waitFor(async () => {
        rows = (await Effect.runPromise(gateway.usage.get())).rows;
        expect(rows[0]?.status).toBe("Complete");
      }, { timeout: 2_000, interval: 20 });
      const requests = (await Effect.runPromise(gateway.requests.get())).requests;
      const ledgerRows = (await Effect.runPromise(gateway.ledger.get())).entries;
      const key = (await Effect.runPromise(gateway.keys.get())).keys[0];
      expect(rows[0]).toMatchObject({ cost: 15, status: "Complete" });
      expect(requests[0]).toMatchObject({ status: "Complete", charged: 15 });
      expect(key?.spent).toBe(15);
      expect(ledgerRows.filter((entry) => entry.kind === "Charge" && entry.amount === 15)).toHaveLength(1);
    } finally {
      await stopGateway(gateway);
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  }, 10_000);

});
