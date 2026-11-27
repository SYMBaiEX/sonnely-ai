import { useSyncExternalStore } from "react";
import { bindSessionWallet, type Remote } from "./remote.ts";

export type WorkspaceSession =
  | { tag: "SignedOut" }
  | {
      tag: "SignedIn";
      wallet: string;
      sessions?: Array<{ digest: string; createdAt: number; expiresAt: number; state: string; current: boolean }>;
    };

export type SessionSnapshot = Remote<WorkspaceSession> & { refresh: () => Promise<WorkspaceSession | undefined> };

async function readSession(): Promise<WorkspaceSession> {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (!response.ok) throw new Error(`session request failed (HTTP ${response.status})`);
  return (await response.json()) as WorkspaceSession;
}

let current: SessionSnapshot;
const listeners = new Set<() => void>();
let source: EventSource | undefined;
let refreshGeneration = 0;

// spec/app/session.md, "Only an active session can sign out": everything the page streams is keyed
// to the wallet the session names. When the wallet changes — sign-out, or a different wallet
// signing in over the last one — the machine streams close with their cached state (remote.ts) and
// the session stream itself reopens, because the server keyed it to the credential it connected
// with and a signed-out or replaced credential never reports the new wallet.
let streamWallet: string | undefined;
let streamBound = false;

function rekeyStream(wallet: string | undefined) {
  const changed = streamBound && streamWallet !== wallet;
  streamWallet = wallet;
  streamBound = true;
  if (!changed || !source) return;
  source.close();
  source = undefined;
  if (listeners.size > 0) openStream();
}

function bindWallet(wallet: string | undefined) {
  bindSessionWallet(wallet);
  rekeyStream(wallet);
}

function publish(state?: WorkspaceSession, error?: string) {
  current = { ...current, state, error };
  if (state !== undefined) bindWallet(state.tag === "SignedIn" ? state.wallet : undefined);
  listeners.forEach((listener) => listener());
}

async function refresh(): Promise<WorkspaceSession | undefined> {
  const generation = ++refreshGeneration;
  try {
    const state = await readSession();
    if (generation === refreshGeneration) publish(state, undefined);
    return state;
  } catch (cause) {
    if (generation === refreshGeneration) {
      publish(current.state, cause instanceof Error ? cause.message : "session request failed");
    }
    return undefined;
  }
}

async function send(input: unknown) {
  if ((input as { type?: string })?.type !== "signOut") return false;
  try {
    const response = await fetch("/api/session/signout", { method: "POST" });
    if (!response.ok) throw new Error(`sign out failed (HTTP ${response.status})`);
    bindWallet(undefined);
    await refresh();
    return true;
  } catch (cause) {
    publish(current.state, cause instanceof Error ? cause.message : "sign out failed");
    return false;
  }
}

function openStream() {
  void refresh();
  source = new EventSource("/api/session/stream");
  source.onmessage = (message) => {
    try {
      publish(JSON.parse(String(message.data)) as WorkspaceSession, undefined);
    } catch {
      publish(current.state, "stream snapshot malformed");
    }
  };
  source.onerror = () => publish(current.state, "stream disconnected");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!source) openStream();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      source?.close();
      source = undefined;
    }
  };
}

current = { state: undefined, send, error: undefined, refresh };

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
