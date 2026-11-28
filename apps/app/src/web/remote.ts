import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

export interface Remote<T> {
  /** The machine's state as the server last sent it; undefined until the first answer. */
  state: T | undefined;
  /** Send one event; resolves with whether the machine's rules allowed it. */
  send(input: unknown): Promise<boolean>;
  /** The last transport or rule failure. */
  error: string | undefined;
}

interface MachineSnapshot {
  state: unknown;
  error: string | undefined;
}

const base = (name: string) => `/api/machines/${name}`;
const emptySnapshot: MachineSnapshot = { state: undefined, error: undefined };

const frameSchema = z.object({
  machine: z.string(),
  state: z.unknown(),
});

const postAnswerSchema = z.looseObject({
  ok: z.boolean(),
  error: z.string().optional(),
  state: z.unknown().optional(),
});

const writeAnswerStateVisible = new Set(["console", "console__chat", "console__logs", "console__batch", "workspace-keys"]);

type MachineFrame = z.infer<typeof frameSchema>;

const machineSnapshots = new Map<string, MachineSnapshot>();
const machineListeners = new Map<string, Set<() => void>>();
const scopedSources = new Map<string, EventSource>();
const scopedMachines = new Set(["workspace-keys", "usage", "admin", "admin-crm", "admin-referrals", "console", "console__chat", "console__logs", "console__batch"]);
let source: EventSource | undefined;
let streamError: string | undefined;

function parseFrame(raw: string): MachineFrame | undefined {
  try {
    const parsed = frameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function machineSnapshot(name: string): MachineSnapshot {
  return machineSnapshots.get(name) ?? emptySnapshot;
}

function updateMachine(name: string, update: Partial<MachineSnapshot>) {
  const current = machineSnapshot(name);
  const next = { ...current, ...update };
  if (next.state === current.state && next.error === current.error) return;
  machineSnapshots.set(name, next);
  for (const notify of machineListeners.get(name) ?? []) notify();
}

function setStreamError(next: string | undefined) {
  if (streamError === next) return;
  streamError = next;
  for (const name of machineListeners.keys()) {
    const current = machineSnapshot(name).error;
    if (next !== undefined || current === "stream disconnected") updateMachine(name, { error: next });
  }
}

function publish(frame: MachineFrame) {
  updateMachine(frame.machine, { state: frame.state });
}

// EventSource retries a dropped connection itself, but a fatal answer — a non-200 while the
// server restarts or a proxy resets mid-deploy — closes it for good, and nothing in the browser
// ever retries again. The reopen timers below resurrect a closed source with capped backoff so a
// deploy or a network blip never costs the user a manual refresh.
const reopenCap = 30_000;
const scopedReopenTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scopedReopenDelays = new Map<string, number>();
let streamReopenTimer: ReturnType<typeof setTimeout> | undefined;
let streamReopenDelay = 0;

function reopenDelayAfter(previous: number) {
  return Math.min(Math.max(previous * 2, 1000), reopenCap);
}

function scheduleScopedReopen(name: string) {
  if (scopedReopenTimers.has(name)) return;
  const delay = reopenDelayAfter(scopedReopenDelays.get(name) ?? 0);
  scopedReopenDelays.set(name, delay);
  scopedReopenTimers.set(
    name,
    setTimeout(() => {
      scopedReopenTimers.delete(name);
      if (machineListeners.has(name) && !scopedSources.has(name)) openScopedStream(name);
    }, delay),
  );
}

function openScopedStream(name: string) {
  if (scopedSources.has(name) || boundWallet === undefined) return;
  const next = new EventSource(`${base(name)}/stream`);
  scopedSources.set(name, next);
  next.onopen = () => {
    scopedReopenDelays.delete(name);
    updateMachine(name, { error: undefined });
  };
  next.onmessage = (message) => {
    try {
      updateMachine(name, { state: JSON.parse(String(message.data)) });
    } catch {
      // Ignore a malformed intermediary frame; the next snapshot replaces it.
    }
  };
  next.onerror = () => {
    if (scopedSources.get(name) !== next) return;
    updateMachine(name, { error: "stream disconnected" });
    if (next.readyState === EventSource.CLOSED) {
      scopedSources.delete(name);
      scheduleScopedReopen(name);
    }
  };
}

function closeScopedStream(name: string) {
  const timer = scopedReopenTimers.get(name);
  if (timer !== undefined) {
    clearTimeout(timer);
    scopedReopenTimers.delete(name);
  }
  scopedSources.get(name)?.close();
  scopedSources.delete(name);
}

function openStream() {
  if (source) return;
  const next = new EventSource("/api/machines/stream");
  source = next;
  next.onopen = () => {
    streamReopenDelay = 0;
    setStreamError(undefined);
  };
  next.onmessage = (message) => {
    const frame = parseFrame(String(message.data));
    if (frame) publish(frame);
  };
  next.onerror = () => {
    if (source !== next) return;
    setStreamError("stream disconnected");
    if (next.readyState === EventSource.CLOSED) {
      source = undefined;
      if (streamReopenTimer === undefined) {
        streamReopenDelay = reopenDelayAfter(streamReopenDelay);
        streamReopenTimer = setTimeout(() => {
          streamReopenTimer = undefined;
          if ([...machineListeners.keys()].some((name) => !scopedMachines.has(name))) openStream();
        }, streamReopenDelay);
      }
    }
  };
}

function closeStream() {
  if (streamReopenTimer !== undefined) {
    clearTimeout(streamReopenTimer);
    streamReopenTimer = undefined;
  }
  source?.close();
  source = undefined;
  streamError = undefined;
}

function closeStreams() {
  closeStream();
  for (const name of [...scopedSources.keys()]) closeScopedStream(name);
}

function openStreams() {
  if (machineListeners.size === 0) return;
  if ([...machineListeners.keys()].some((name) => !scopedMachines.has(name))) openStream();
  for (const name of machineListeners.keys()) if (scopedMachines.has(name)) openScopedStream(name);
}

// spec/app/session.md, "Only an active session can sign out": machine state and streams are bound
// to the wallet the session names. A different wallet — sign-out included — never reuses what the
// last one had: every open stream closes and every cached state drops before fresh streams open,
// so nothing one wallet saw can be served to another.
let boundWallet: string | undefined;
let walletBound = false;

export function bindSessionWallet(wallet: string | undefined) {
  if (walletBound && boundWallet !== wallet) {
    closeStreams();
    machineSnapshots.clear();
    for (const listeners of machineListeners.values()) {
      for (const notify of listeners) notify();
    }
  }
  boundWallet = wallet;
  walletBound = true;
  openStreams();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", closeStreams);
  window.addEventListener("pageshow", openStreams);
}

function subscribeMachine(name: string, notify: () => void) {
  const scoped = scopedMachines.has(name);
  const listeners = machineListeners.get(name) ?? new Set<() => void>();
  listeners.add(notify);
  machineListeners.set(name, listeners);
  if (!scoped && streamError !== undefined) updateMachine(name, { error: streamError });
  if (scoped) openScopedStream(name);
  else openStream();
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      machineListeners.delete(name);
      if (scoped) closeScopedStream(name);
    }
    if (machineListeners.size === 0) closeStream();
  };
}

export function reconnectMachine(name: string) {
  updateMachine(name, { error: undefined });
  if (scopedMachines.has(name)) {
    closeScopedStream(name);
    if (machineListeners.has(name)) openScopedStream(name);
    return;
  }
  if (machineListeners.size === 0) return;
  closeStream();
  openStream();
}

/** One spec machine kept by the server: its state, and a way to send it events. */
export function useRemote<T>(name: string): Remote<T> {
  const subscribe = useCallback((notify: () => void) => subscribeMachine(name, notify), [name]);
  const snapshot = useSyncExternalStore(subscribe, () => machineSnapshot(name), () => emptySnapshot);

  const send = useCallback(
    async (input: unknown) => {
      try {
        const response = await fetch(base(name), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const parsed = postAnswerSchema.safeParse(await response.json().catch(() => undefined));
        const answer = parsed.success ? parsed.data : undefined;
        if (!answer?.ok) {
          updateMachine(name, { error: answer?.error ?? `request failed (HTTP ${response.status})` });
          return false;
        }
        updateMachine(name, writeAnswerStateVisible.has(name) && answer.state !== undefined ? { state: answer.state, error: undefined } : { error: undefined });
        return true;
      } catch (cause) {
        updateMachine(name, { error: cause instanceof Error ? cause.message : "request failed" });
        return false;
      }
    },
    [name],
  );

  return { state: snapshot.state as T | undefined, send, error: snapshot.error };
}
