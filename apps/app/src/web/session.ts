import { useSyncExternalStore } from "react";
import type { Remote } from "./remote.ts";

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

function publish(state?: WorkspaceSession, error?: string) {
  current = { ...current, state, error };
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
