// spec/app/session.md, "Only an active session can sign out"
// @vitest-environment happy-dom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Remote } from "../src/web/remote.ts";
import type { SessionSnapshot, WorkspaceSession } from "../src/web/session.ts";

const walletA = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const walletB = "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;
  onmessage: ((message: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
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

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderProbe() {
  vi.resetModules();
  FakeEventSource.instances = [];
  const remote = await import("../src/web/remote.ts");
  const sessionModule = await import("../src/web/session.ts");
  let session: SessionSnapshot | undefined;
  let teams: Remote<{ teams?: unknown[] }> | undefined;
  function Probe() {
    session = sessionModule.useSession();
    teams = remote.useRemote("teams");
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(<Probe />);
  });
  await settle();
  return {
    session: () => session!,
    teams: () => teams!,
    root,
    el,
  };
}

describe("session-bound streams (spec/app/session.md, \"Only an active session can sign out\")", () => {
  let sessionState: WorkspaceSession = signedIn(walletA);

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function stubTransport() {
    sessionState = signedIn(walletA);
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/session/signout") {
        sessionState = { tag: "SignedOut" };
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (url === "/api/session") return Promise.resolve(Response.json(sessionState));
      if (init?.method === "POST") return Promise.resolve(Response.json({ ok: true }));
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
  }

  // spec/app/session.md, "Only an active session can sign out"
  it("closes every machine stream and drops machine state on sign-out", async () => {
    stubTransport();
    const probe = await renderProbe();
    expect(machineSources("/api/machines/stream").length).toBe(1);
    const multiplexed = machineSources("/api/machines/stream")[0];
    act(() => {
      multiplexed.emit({ machine: "teams", state: { teams: [{ id: "team-a" }] } });
    });
    expect(probe.teams().state?.teams?.length).toBe(1);

    await act(async () => {
      await probe.session().send({ type: "signOut" });
    });
    await settle();

    expect({
      multiplexedClosed: multiplexed.closed,
      stateAfterSignOut: probe.teams().state,
      sessionTag: probe.session().state?.tag,
    }).toEqual({ multiplexedClosed: true, stateAfterSignOut: undefined, sessionTag: "SignedOut" });
  });

  // spec/app/session.md, "Only an active session can sign out"
  it("never reuses a prior wallet's stream when a different wallet signs in", async () => {
    stubTransport();
    const probe = await renderProbe();
    const multiplexed = machineSources("/api/machines/stream")[0];
    const sessionStream = machineSources("/api/session/stream")[0];
    act(() => {
      multiplexed.emit({ machine: "teams", state: { teams: [{ id: "team-a" }] } });
    });
    expect(probe.teams().state?.teams?.length).toBe(1);

    sessionState = signedIn(walletB);
    await act(async () => {
      await probe.session().refresh();
    });
    await settle();

    const reopened = machineSources("/api/machines/stream").filter((instance) => !instance.closed);
    const sessionReopened = machineSources("/api/session/stream").filter((instance) => !instance.closed);
    expect({
      oldMultiplexedClosed: multiplexed.closed,
      oldSessionStreamClosed: sessionStream.closed,
      reopenedIsNew: reopened.length === 1 && reopened[0] !== multiplexed,
      sessionReopenedIsNew: sessionReopened.length === 1 && sessionReopened[0] !== sessionStream,
      stateDropped: probe.teams().state,
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
});
