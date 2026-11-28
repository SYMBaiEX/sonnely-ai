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

const referralCookie = "sonnely_referral";

function readReferralCookie() {
  const prefix = referralCookie + "=";
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  if (!entry) return "";
  const value = entry.slice(prefix.length);
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

// spec/app/admin/referrals.md, "Story: Invite a wallet"
export function captureReferralInvite() {
  const params = new URLSearchParams(window.location.search);
  let code = params.get("ref") ?? "";
  if (code) {
    params.delete("ref");
    const search = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (search ? "?" + search : "") + window.location.hash);
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = referralCookie + "=" + encodeURIComponent(code) + "; path=/; samesite=lax" + secure;
  }
  if (!code) code = readReferralCookie();
  if (!code) return;
  void fetch("/api/session/referral", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  }).catch(() => {});
}

async function readSession(): Promise<WorkspaceSession> {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (!response.ok) throw new Error(`session request failed (HTTP ${response.status})`);
  return (await response.json()) as WorkspaceSession;
}

let current: SessionSnapshot;
const listeners = new Set<() => void>();
let source: EventSource | undefined;
let sessionEpoch = 0;
let refreshSequence = 0;

// spec/app/session.md, "Only an active session can sign out": everything the page streams is keyed
// to the wallet the session names. When the wallet changes — sign-out, or a different wallet
// signing in over the last one — the machine streams close with their cached state (remote.ts) and
// the session stream itself reopens, because the server keyed it to the credential it connected
// with and a signed-out or replaced credential never reports the new wallet.
let streamWallet: string | undefined;
let streamBound = false;

function closeStream() {
  const closing = source;
  source = undefined;
  closing?.close();
}

function rekeyStream(wallet: string | undefined) {
  const changed = !streamBound || streamWallet !== wallet;
  streamWallet = wallet;
  streamBound = true;
  if (!changed) return;
  closeStream();
  if (listeners.size > 0) openStream();
}

function bindWallet(wallet: string | undefined) {
  bindSessionWallet(wallet);
  rekeyStream(wallet);
}

function publish(state?: WorkspaceSession, error?: string) {
  if (state !== undefined) sessionEpoch += 1;
  current = { ...current, state: state ?? current.state, error };
  if (state !== undefined) bindWallet(state.tag === "SignedIn" ? state.wallet : undefined);
  listeners.forEach((listener) => listener());
}

async function refresh(): Promise<WorkspaceSession | undefined> {
  const request = ++refreshSequence;
  const epoch = sessionEpoch;
  const currentRefresh = () => request === refreshSequence && epoch === sessionEpoch;
  try {
    const state = await readSession();
    if (!currentRefresh()) return undefined;
    publish(state, undefined);
    return state;
  } catch (cause) {
    if (currentRefresh()) {
      publish(undefined, cause instanceof Error ? cause.message : "session request failed");
    }
    return undefined;
  }
}

async function send(input: unknown) {
  if ((input as { type?: string })?.type !== "signOut") return false;
  try {
    const response = await fetch("/api/session/signout", { method: "POST" });
    if (!response.ok) throw new Error(`sign out failed (HTTP ${response.status})`);
    publish({ tag: "SignedOut" }, undefined);
    await refresh();
    return true;
  } catch (cause) {
    publish(undefined, cause instanceof Error ? cause.message : "sign out failed");
    return false;
  }
}

function openStream() {
  captureReferralInvite();
  void refresh();
  const next = new EventSource("/api/session/stream");
  source = next;
  next.onmessage = (message) => {
    if (source !== next) return;
    try {
      publish(JSON.parse(String(message.data)) as WorkspaceSession, undefined);
    } catch {
      publish(undefined, "stream snapshot malformed");
    }
  };
  next.onerror = () => {
    if (source === next) publish(undefined, "stream disconnected");
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!source) openStream();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) closeStream();
  };
}

current = { state: undefined, send, error: undefined, refresh };

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
