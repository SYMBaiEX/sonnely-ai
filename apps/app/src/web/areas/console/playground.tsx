/* eslint-disable @eslint-react/naming-convention-ref-name, @eslint-react/naming-convention-context-name -- the endpoint picker ref and controls context use the playground's established names */
import { createContext, useRef, useState, type ReactNode } from "react";
import { Terminal } from "lucide-react";
import { PlaygroundInference, workloadOptions, type Workload } from "./playground-inference.tsx";

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

export function Playground({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
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

  const route = endpoint === "chat" ? "POST /chat/completions" : endpoint === "realtime" ? "WS /realtime" : "POST /" + endpoint;

  return (
    <div data-playground-canvas>
      <div data-playground-request-toolbar>
        <label data-playground-endpoint-picker>
          <Terminal size={17} aria-hidden="true" />
          <span className="sr-only">Endpoint</span>
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
        <div data-playground-toolbar-controls ref={setControls} />
        <code data-playground-route-path>{route}</code>
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
        <div data-playground-stage>
          <div data-playground-mode hidden={endpoint !== "chat"}>
            {children}
          </div>
          {visited.map((id) => (
            <div data-playground-mode key={id} hidden={endpoint !== id}>
              <PlaygroundInference endpoint={id} signedIn={signedIn} onRunningChange={setRunning} controls={endpoint === id ? controls : null} />
            </div>
          ))}
        </div>
      </PlaygroundControls.Provider>
    </div>
  );
}
