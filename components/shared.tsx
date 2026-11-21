"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Search } from "lucide-react";
import { models } from "@/lib/models";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
    setTimeout(() => setStatus(""), 1600);
  }
  return (
    <button type="button" className="button quiet small" onClick={copy} aria-label={status || label}>
      {status === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span>{status || label}</span>
    </button>
  );
}

export function ModelCatalog() {
  const [filter, setFilter] = useState("");
  const displayed = models.filter((model) =>
    (model.name + " " + model.type + " " + model.id).toLowerCase().includes(filter.toLowerCase().trim()),
  );
  return (
    <>
      <label className="search">
        <Search size={17} />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a model"
          aria-label="Find a model"
        />
      </label>
      <div className="model-cards catalog-cards">
        {displayed.map((model) => (
          <article key={model.id} className="panel model-card">
            <div className="between">
              <span className={"model-mark " + model.color}>{model.mark}</span>
              <span className="mono subtle">{model.type}</span>
            </div>
            <h3>{model.name}</h3>
            <p>{model.summary}</p>
            <dl>
              <div>
                <dt>Provider context</dt>
                <dd>{model.context}</dd>
              </div>
              <div>
                <dt>Input / 1M</dt>
                <dd>${model.input.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Output / 1M</dt>
                <dd>${model.output.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Cached / 1M</dt>
                <dd>${model.cache}</dd>
              </div>
            </dl>
            <div className="between model-actions">
              <CopyButton value={model.id} label="Copy model ID" />
              <Link href={"/console?model=" + encodeURIComponent(model.id)} className="text-link">
                Open in chat <ArrowUpRight size={15} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!displayed.length && (
        <p className="empty" role="status">
          No models match your search.
        </p>
      )}
      <p className="caption">
        NEAR AI lists these models in its Private TEE tier. Relay accepts text requests with smaller limits.{" "}
        <a href="https://near.ai/models">Provider catalog ↗</a>
      </p>
    </>
  );
}

export function CodeExample() {
  const [tab, setTab] = useState<"cURL" | "JavaScript" | "Python">("cURL");
  const model = models[0].id;
  const scripts = {
    cURL: [
      'curl "$FATHOM_ORIGIN/v1/chat/completions" ' + String.fromCharCode(92),
      '  -H "Authorization: Bearer $FATHOM_API_KEY" ' + String.fromCharCode(92),
      '  -H "Content-Type: application/json" ' + String.fromCharCode(92),
      "  -d '{",
      '    "model": "' + model + '",',
      '    "messages": [{"role":"user","content":"Summarize this design."}]',
      "  }'",
    ].join("\n"),
    JavaScript:
      'import OpenAI from "openai";\n\nconst relay = new OpenAI({\n  baseURL: process.env.FATHOM_ORIGIN + "/v1",\n  apiKey: process.env.FATHOM_API_KEY,\n});\n\nconst reply = await relay.chat.completions.create({\n  model: "' +
      model +
      '",\n  messages: [{ role: "user", content: "Summarize this design." }],\n});',
    Python:
      'import os\nfrom openai import OpenAI\n\nrelay = OpenAI(\n    base_url=os.environ["FATHOM_ORIGIN"] + "/v1",\n    api_key=os.environ["FATHOM_API_KEY"],\n)\n\nreply = relay.chat.completions.create(\n    model="' +
      model +
      '",\n    messages=[{"role": "user", "content": "Summarize this design."}],\n)',
  };
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
        <CopyButton value={scripts[tab]} label="Copy code" />
      </div>
      <pre>
        <code>{scripts[tab]}</code>
      </pre>
    </div>
  );
}
