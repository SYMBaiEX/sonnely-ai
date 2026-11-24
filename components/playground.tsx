"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ProviderId } from "@/lib/provider-catalog";
import { PlaygroundInference, workloadOptions, type Workload } from "./playground-inference";
import type { Session } from "./wallet";

const groups = {
  Text: ["responses", "embeddings", "rerank", "systemone"],
  Audio: ["audio/transcriptions", "realtime", "audio/translations", "audio/speech"],
  Documents: ["convert/file", "redact"],
  Images: ["images/generations", "images/edits"],
} satisfies Record<string, Workload[]>;

export function Playground({ children, session, providers, refresh }: {
  children: ReactNode;
  session: Session | null;
  providers: ProviderId[];
  refresh: () => Promise<void>;
}) {
  const [endpoint, setEndpoint] = useState<Workload | "chat">("chat");
  const [running, setRunning] = useState(false);
  const route = endpoint === "chat" ? "POST /chat/completions"
    : endpoint === "realtime" ? "WS /realtime" : "POST /" + endpoint;

  return (
    <div className="playground-workspace">
      <header className="playground-workspace-heading">
        <h1>Playground</h1>
        <Link className="button quiet small" href="/docs/api">
          API reference <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <div className="playground-canvas">
        <div className="playground-request-toolbar">
          <label>
            Endpoint
            <select value={endpoint} disabled={running} onChange={(event) => {
              setEndpoint(event.currentTarget.value as Workload | "chat");
            }}>
              <option value="chat">Chat Completions</option>
              {Object.entries(groups).map(([label, endpoints]) => (
                <optgroup key={label} label={label}>
                  {endpoints.map((id) => <option key={id} value={id}>{workloadOptions[id].label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <code>{route}</code>
        </div>
        <div hidden={endpoint !== "chat"}>{children}</div>
        {endpoint !== "chat" && (
          <PlaygroundInference key={endpoint} endpoint={endpoint}
            session={session} providers={providers} refresh={refresh} onRunningChange={setRunning} />
        )}
      </div>
    </div>
  );
}
