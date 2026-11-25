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
});

type MachineFrame = z.infer<typeof frameSchema>;

const machineSnapshots = new Map<string, MachineSnapshot>();
const machineListeners = new Map<string, Set<() => void>>();
const scopedSources = new Map<string, EventSource>();
const scopedMachines = new Set(["workspace-keys", "usage"]);
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

function openScopedStream(name: string) {
  if (scopedSources.has(name)) return;
  const next = new EventSource(`${base(name)}/stream`);
  scopedSources.set(name, next);
  next.onopen = () => updateMachine(name, { error: undefined });
  next.onmessage = (message) => {
    try {
      updateMachine(name, { state: JSON.parse(String(message.data)) });
    } catch {
      // Ignore a malformed intermediary frame; the next snapshot replaces it.
    }
  };
  next.onerror = () => {
    if (scopedSources.get(name) === next) updateMachine(name, { error: "stream disconnected" });
  };
}

function closeScopedStream(name: string) {
  scopedSources.get(name)?.close();
  scopedSources.delete(name);
}

function openStream() {
  if (source) return;
  const next = new EventSource("/api/machines/stream");
  source = next;
  next.onopen = () => setStreamError(undefined);
  next.onmessage = (message) => {
    const frame = parseFrame(String(message.data));
    if (frame) publish(frame);
  };
  next.onerror = () => {
    if (source === next) setStreamError("stream disconnected");
  };
}

function closeStream() {
  source?.close();
  source = undefined;
  streamError = undefined;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", closeStream);
  window.addEventListener("pageshow", () => {
    if (machineListeners.size > 0) openStream();
  });
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
        if (!answer?.ok) updateMachine(name, { error: answer?.error ?? `request failed (HTTP ${response.status})` });
        return answer?.ok ?? false;
      } catch (cause) {
        updateMachine(name, { error: cause instanceof Error ? cause.message : "request failed" });
        return false;
      }
    },
    [name],
  );

  return { state: snapshot.state as T | undefined, send, error: snapshot.error };
}
