"use client";

import { createContext, useRef, useState, type ReactNode } from "react";
import { Terminal } from "lucide-react";
import type { ProviderId } from "@/lib/provider-catalog";
import { PlaygroundInference, workloadOptions, type Workload } from "./playground-inference";
import type { Session } from "./wallet";

const groups = {
  Text: ["responses", "embeddings", "rerank", "systemone"],
  Audio: ["audio/transcriptions", "realtime", "audio/translations", "audio/speech"],
  Documents: ["convert/file", "redact"],
  Images: ["images/generations", "images/edits"],
} satisfies Record<string, Workload[]>;

export const PlaygroundControls = createContext<{
  mount: HTMLDivElement | null;
  chat: boolean;
  select: (endpoint: Workload) => void;
}>({
  mount: null,
  chat: false,
  select: () => {},
});

export function Playground({
  children,
  session,
  providers,
  refresh,
}: {
  children: ReactNode;
  session: Session | null;
  providers: ProviderId[];
  refresh: () => Promise<void>;
}) {
  const [endpoint, setEndpoint] = useState<Workload | "chat">("chat");
  const [visited, setVisited] = useState<Workload[]>([]);
  const [controls, setControls] = useState<HTMLDivElement | null>(null);
  const endpointPicker = useRef<HTMLSelectElement>(null);
  const [running, setRunning] = useState(false);
  function choose(next: Workload | "chat") {
    if (next === endpoint || running) return;
    if (next !== "chat") setVisited((current) => (current.includes(next) ? current : [...current, next]));
    setEndpoint(next);
  }

  const route =
    endpoint === "chat"
      ? "POST /chat/completions"
      : endpoint === "realtime"
        ? "WS /realtime"
        : "POST /" + endpoint;

  return (
    <div className="playground-canvas">
      <div className="playground-request-toolbar">
        <label className="playground-endpoint-picker">
          <Terminal size={17} aria-hidden="true" />
          <span className="visually-hidden">Endpoint</span>
          <select
            ref={endpointPicker}
            value={endpoint}
            disabled={running}
            onChange={(event) => {
              choose(event.currentTarget.value as Workload | "chat");
            }}
          >
            <option value="chat">Chat Completions</option>
            {Object.entries(groups).map(([label, endpoints]) => (
              <optgroup key={label} label={label}>
                {endpoints.map((id) => (
                  <option key={id} value={id}>
                    {workloadOptions[id].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="playground-toolbar-controls" ref={setControls} />
        <code className="playground-route-path">{route}</code>
      </div>
      <PlaygroundControls.Provider
        value={{
          mount: controls,
          chat: endpoint === "chat",
          select: (next) => {
            choose(next);
            endpointPicker.current?.focus();
          },
        }}
      >
        <div className="playground-stage">
          <div className="playground-mode" hidden={endpoint !== "chat"}>
            {children}
          </div>
          {visited.map((id) => (
            <div className="playground-mode" key={id} hidden={endpoint !== id}>
              <PlaygroundInference
                endpoint={id}
                session={session}
                providers={providers}
                refresh={refresh}
                onRunningChange={setRunning}
                controls={endpoint === id ? controls : null}
              />
            </div>
          ))}
        </div>
      </PlaygroundControls.Provider>
    </div>
  );
}
