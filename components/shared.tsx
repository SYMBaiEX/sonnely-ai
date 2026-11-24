"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { apiBasePath } from "@/lib/api-contract";
import { models } from "@/lib/models";

export function CopyButton({
  value,
  label = "Copy",
  text = label,
}: {
  value: string;
  label?: string;
  text?: string;
}) {
  const [status, setStatus] = useState("");
  const clearStatus = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(clearStatus.current), []);
  async function copy() {
    clearTimeout(clearStatus.current);
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
    clearStatus.current = setTimeout(() => setStatus(""), 1600);
  }
  return (
    <button type="button" className="button quiet small" onClick={copy} aria-label={status || label}>
      {status === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span>{status || text}</span>
    </button>
  );
}

export function CodeExample() {
  const [tab, setTab] = useState<"cURL" | "JavaScript" | "Python">("cURL");
  const model = models[0].id;
  const scripts = {
    cURL: [
      'curl "$SONNELY_ORIGIN@BASE@/chat/completions" ' + String.fromCharCode(92),
      '  -H "Authorization: Bearer $SONNELY_API_KEY" ' + String.fromCharCode(92),
      '  -H "Content-Type: application/json" ' + String.fromCharCode(92),
      "  -d '{",
      '    "model": "' + model + '",',
      '    "messages": [{"role":"user","content":"Summarize this design."}]',
      "  }'",
    ].join("\n"),
    JavaScript:
      'import OpenAI from "openai";\n\nconst sonnely = new OpenAI({\n  baseURL: process.env.SONNELY_ORIGIN + "@BASE@",\n  apiKey: process.env.SONNELY_API_KEY,\n});\n\nconst reply = await sonnely.chat.completions.create({\n  model: "' +
      model +
      '",\n  messages: [{ role: "user", content: "Summarize this design." }],\n});',
    Python:
      'import os\nfrom openai import OpenAI\n\nsonnely = OpenAI(\n    base_url=os.environ["SONNELY_ORIGIN"] + "@BASE@",\n    api_key=os.environ["SONNELY_API_KEY"],\n)\n\nreply = sonnely.chat.completions.create(\n    model="' +
      model +
      '",\n    messages=[{"role": "user", "content": "Summarize this design."}],\n)',
  };
  const code = scripts[tab].replace("@BASE@", apiBasePath);
  return (
    <div className="code-sample">
      <div className="between">
        <div className="segmented" aria-label="Code language">
          {(["cURL", "JavaScript", "Python"] as const).map((name) => (
            <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </div>
        <CopyButton value={code} label="Copy code" />
      </div>
      <pre>
        <code>
          {code.split("\n").map((line, index) => (
            <span className="code-line" key={index}>
              <span className="code-line-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
