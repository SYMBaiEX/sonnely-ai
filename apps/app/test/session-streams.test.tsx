// spec/app/session.md, "Only an active session can sign out"
// @vitest-environment happy-dom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Remote } from "../src/web/remote.ts";
import type { SessionSnapshot, WorkspaceSession } from "../src/web/session.ts";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";
const cleanups: Array<() => void> = [];

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;
  readyState = FakeEventSource.CONNECTING;
  onmessage: ((message: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function signedIn(wallet: string): WorkspaceSession {
  return { tag: "SignedIn", wallet };
}

function machineSources(urlPrefix: string) {
  return FakeEventSource.instances.filter((instance) => instance.url.startsWith(urlPrefix));
}

function currentMachineSource(urlPrefix: string) {
  const open = machineSources(urlPrefix).filter((instance) => !instance.closed);
  if (open.length !== 1) throw new Error(`expected one open stream for ${urlPrefix}, found ${open.length}`);
  return open[0];
}

function deferredResponse() {
  let release: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderProbe(machine: "teams" | "admin-referrals" | "console" | "console__chat" = "teams") {
  vi.resetModules();
  FakeEventSource.instances = [];
  const remote = await import("../src/web/remote.ts");
  const sessionModule = await import("../src/web/session.ts");
  let session: SessionSnapshot | undefined;
  let machineRemote: Remote<{ teams?: unknown[]; profile?: string }> | undefined;
  function Probe() {
    session = sessionModule.useSession();
    machineRemote = remote.useRemote(machine);
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  act(() => {
    root.render(<Probe />);
  });
  await settle();
  return {
    session: () => session!,
    machine: () => machineRemote!,
    root,
    el,
  };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
  document.cookie = "sonnely_referral=; max-age=0; path=/";
  history.replaceState(null, "", "/");
  document.body.innerHTML = "";
});

describe("session-bound streams (spec/app/session.md, \"Only an active session can sign out\")", () => {
  let sessionState: WorkspaceSession = signedIn(walletA);

  // spec/app/admin/referrals.md, "Story: Invite a wallet"; spec/app/session.md, "Story: Sign in with a wallet"
  it("parks an invite parameter for the session boundary and strips it from the address", async () => {
    history.replaceState(null, "", "/console?ref=parked-invite&keep=1#top");
    const posts: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
      posts.push({ url: String(input), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      return Promise.resolve(Response.json({ ok: true }));
    });
    vi.resetModules();
    const sessionModule = await import("../src/web/session.ts");
    sessionModule.captureReferralInvite();
    expect({
      address: window.location.pathname + window.location.search + window.location.hash,
      cookie: document.cookie,
      posts,
    }).toEqual({
      address: "/console?keep=1#top",
      cookie: "sonnely_referral=parked-invite",
      posts: [{ url: "/api/session/referral", body: { code: "parked-invite" } }],
    });
  });

  function stubTransport(
    initial: WorkspaceSession = signedIn(walletA),
    transport: { readSession?: () => Promise<Response>; writeMachine?: () => Promise<Response> } = {},
  ) {

    sessionState = initial;
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/session/signout") {
        sessionState = { tag: "SignedOut" };
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url === "/api/session") return transport.readSession?.() ?? Promise.resolve(Response.json(sessionState));
      if (init?.method === "POST") return transport.writeMachine?.() ?? Promise.resolve(Response.json({ ok: true }));
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
  }

  // spec/app/session.md, "Only an active session can sign out"
  it("waits for a session wallet before opening a scoped machine stream", async () => {
    stubTransport({ tag: "SignedOut" });
    const probe = await renderProbe("admin-referrals");
    const scopedUrl = "/api/machines/admin-referrals/stream";
    expect(machineSources(scopedUrl).length).toBe(0);

    sessionState = signedIn(walletA);
    await act(async () => {
      await probe.session().refresh();
    });
    await settle();

    const opened = machineSources(scopedUrl);
    expect(opened.length).toBe(1);

    await act(async () => {
      await probe.session().send({ type: "signOut" });
    });
    await settle();

    expect({
      closed: opened[0]?.closed,
      openStreams: machineSources(scopedUrl).filter((instance) => !instance.closed).length,
    }).toEqual({ closed: true, openStreams: 0 });
  });

  // spec/app/session.md, "Only an active session can sign out"
  it("closes every machine stream and drops machine state on sign-out", async () => {
    const pendingWrite = deferredResponse();
    stubTransport(signedIn(walletA), {
      readSession: () =>
        sessionState.tag === "SignedOut"
          ? Promise.resolve(new Response("unavailable", { status: 500 }))
          : Promise.resolve(Response.json(sessionState)),
      writeMachine: () => pendingWrite.promise,
    });
    const probe = await renderProbe("console");
    const scoped = currentMachineSource("/api/machines/console/stream");
    act(() => {
      scoped.emit({ profile: "workspace-a" });
    });
    expect(probe.machine().state).toEqual({ profile: "workspace-a" });
    const write = probe.machine().send({ type: "saveProfile" });

    await act(async () => {
      await probe.session().send({ type: "signOut" });
    });
    pendingWrite.release(Response.json({ ok: true, state: { profile: "workspace-a" } }));
    await act(async () => {
      await write;
    });
    await settle();

    expect({
      scopedClosed: scoped.closed,
      stateAfterSignOut: probe.machine().state,
      sessionTag: probe.session().state?.tag,
    }).toEqual({ scopedClosed: true, stateAfterSignOut: undefined, sessionTag: "SignedOut" });
  });

  // spec/app/console/chat.md, "The playground is the threads, the open one and the chosen model"
  it("subscribes a fleet machine to its own stream endpoint, not the multiplexed one", async () => {
    stubTransport();
    const probe = await renderProbe("console__chat");
    const scopedUrl = "/api/machines/console__chat/stream";
    expect({
      scoped: machineSources(scopedUrl).length,
      multiplexed: machineSources("/api/machines/stream").filter((instance) => instance.url === "/api/machines/stream").length,
    }).toEqual({ scoped: 1, multiplexed: 0 });

    const scoped = machineSources(scopedUrl)[0];
    act(() => {
      scoped.emit({ threads: [{ id: "thread-a" }], active: "thread-a", model: "m" });
    });
    expect((probe.machine().state as { threads?: unknown[] } | undefined)?.threads?.length).toBe(1);
  });

  // spec/app/session.md, "Only an active session can sign out"
  it("never reuses a prior wallet's stream when a different wallet signs in", async () => {
    stubTransport();
    const probe = await renderProbe();
    const multiplexed = currentMachineSource("/api/machines/stream");
    const sessionStream = currentMachineSource("/api/session/stream");
    act(() => {
      multiplexed.emit({ machine: "teams", state: { teams: [{ id: "team-a" }] } });
    });
    expect(probe.machine().state?.teams?.length).toBe(1);

    sessionState = signedIn(walletB);
    await act(async () => {
      await probe.session().refresh();
    });
    await settle();
    act(() => {
      multiplexed.emit({ machine: "teams", state: { teams: [{ id: "team-a" }] } });
      sessionStream.emit(signedIn(walletA));
    });

    const reopened = machineSources("/api/machines/stream").filter((instance) => !instance.closed);
    const sessionReopened = machineSources("/api/session/stream").filter((instance) => !instance.closed);
    expect({
      oldMultiplexedClosed: multiplexed.closed,
      oldSessionStreamClosed: sessionStream.closed,
      reopenedIsNew: reopened.length === 1 && reopened[0] !== multiplexed,
      sessionReopenedIsNew: sessionReopened.length === 1 && sessionReopened[0] !== sessionStream,
      stateDropped: probe.machine().state,
      wallet: (() => {
        const state = probe.session().state;
        return state?.tag === "SignedIn" ? state.wallet : undefined;
      })(),
    }).toEqual({
      oldMultiplexedClosed: true,
      oldSessionStreamClosed: true,
      reopenedIsNew: true,
      sessionReopenedIsNew: true,
      stateDropped: undefined,
      wallet: walletB,
    });
  });

  // spec/app/session.md, "Only an active session can sign out"
  it("ignores bootstrap state that a newer sign-out stream transition has superseded", async () => {
    const pendingSession = deferredResponse();
    stubTransport(signedIn(walletA), { readSession: () => pendingSession.promise });
    const probe = await renderProbe();
    const multiplexed = currentMachineSource("/api/machines/stream");
    const sessionStream = currentMachineSource("/api/session/stream");
    act(() => {
      multiplexed.emit({ machine: "teams", state: { teams: [{ id: "team-a" }] } });
    });
    expect(probe.machine().state?.teams?.length).toBe(1);

    act(() => {
      sessionStream.emit({ tag: "SignedOut" });
    });
    expect(probe.session().state?.tag).toBe("SignedOut");

    await act(async () => {
      pendingSession.release(Response.json(signedIn(walletA)));
      await pendingSession.promise;
    });
    await settle();

    expect({
      sessionTag: probe.session().state?.tag,
      machineState: probe.machine().state,
      oldMultiplexedClosed: multiplexed.closed,
    }).toEqual({ sessionTag: "SignedOut", machineState: undefined, oldMultiplexedClosed: true });
  });
});

function sessionSnapshot(state: WorkspaceSession): SessionSnapshot {
  return {
    state,
    error: undefined,
    send: () => Promise.resolve(false),
    refresh: () => Promise.resolve(state),
  };
}

async function renderChat(state: WorkspaceSession) {
  vi.resetModules();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  const [{ ChatSection }, { SessionContext }, remote] = await Promise.all([
    import("../src/web/areas/console/chat.tsx"),
    import("../src/web/areas/console/frame.tsx"),
    import("../src/web/remote.ts"),
  ]);
  remote.bindSessionWallet(state.tag === "SignedIn" ? state.wallet : undefined);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  act(() => {
    root.render(
      <StrictMode>
        <SessionContext value={sessionSnapshot(state)}>
          <ChatSection />
        </SessionContext>
      </StrictMode>,
    );
  });
  await settle();
  return el;
}

function chatMachineStream() {
  const streams = machineSources("/api/machines/console__chat/stream");
  const stream = streams.filter((instance) => !instance.closed).at(-1) ?? streams.at(-1);
  if (!stream) throw new Error("the chat machine did not open its scoped stream");
  return stream;
}

describe("chat machine stream failure", () => {
  // spec/app/console/chat.md, "Story: Converse with a model"
  it("explains a signed-in composer's disabled machine state when the stream disconnects", async () => {
    const el = await renderChat(signedIn(walletA));
    expect(el.querySelector("[role=alert]")).toBeNull();

    act(() => {
      chatMachineStream().onerror?.();
    });

    expect(el.querySelector("[role=alert]")?.textContent).toContain("stream disconnected");
  });

  // spec/app/console/chat.md, "Story: Converse with a model"
  it("keeps machine loading free of stream failure chrome", async () => {
    const el = await renderChat(signedIn(walletA));

    expect(chatMachineStream()).toBeDefined();
    expect(el.querySelector("[role=alert]")).toBeNull();
  });

  // spec/app/session.md, "Story: Sign in with a wallet"
  it("keeps signed-out onboarding free of machine stream failure chrome", async () => {
    const el = await renderChat({ tag: "SignedOut" });

    expect(machineSources("/api/machines/console__chat/stream").length).toBe(0);
    expect(el.querySelector("[role=alert]")).toBeNull();
    expect(el.textContent).toContain("Connect a wallet to run live inference.");
  });
});
