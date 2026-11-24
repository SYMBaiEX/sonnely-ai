"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, AudioLines, Braces, FileText, Image, MessagesSquare } from "lucide-react";
import type { ProviderId } from "@/lib/provider-catalog";
import { PlaygroundInference, type Workload } from "./playground-inference";
import type { Session } from "./wallet";

const sections = {
  chat: { label: "Chat", icon: MessagesSquare, endpoints: [] },
  text: { label: "Text", icon: Braces, endpoints: ["responses", "embeddings", "rerank", "systemone"] },
  audio: { label: "Audio", icon: AudioLines, endpoints: ["audio/transcriptions", "realtime", "audio/translations", "audio/speech"] },
  documents: { label: "Documents", icon: FileText, endpoints: ["convert/file", "redact"] },
  images: { label: "Images", icon: Image, endpoints: ["images/generations", "images/edits"] },
} satisfies Record<string, { label: string; icon: typeof MessagesSquare; endpoints: Workload[] }>;

type Section = keyof typeof sections;

export function Playground({ children, session, providers, refresh }: {
  children: ReactNode;
  session: Session | null;
  providers: ProviderId[];
  refresh: () => Promise<void>;
}) {
  const [section, setSection] = useState<Section>("chat");
  const [running, setRunning] = useState(false);

  return (
    <div className="playground-workspace">
      <header className="playground-workspace-heading">
        <div>
          <h1>Playground</h1>
          <p>Run inference with your workspace credits and inspect what comes back.</p>
        </div>
        <Link className="button quiet small" href="/docs/api">
          API reference <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <nav className="playground-switcher" aria-label="Inference workloads">
        {(Object.keys(sections) as Section[]).map((id) => {
          const { icon: Icon, label } = sections[id];
          return (
            <button key={id} type="button" aria-current={id === section ? "true" : undefined}
              aria-controls="playground-workload"
              disabled={running && id !== section}
              onClick={() => setSection(id)}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>
      <div id="playground-workload">
        <div hidden={section !== "chat"}>{children}</div>
        {section !== "chat" && (
          <PlaygroundInference key={section} endpoints={sections[section].endpoints}
            session={session} providers={providers} refresh={refresh} onRunningChange={setRunning} />
        )}
      </div>
    </div>
  );
}
