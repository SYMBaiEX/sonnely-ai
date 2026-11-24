"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Search } from "lucide-react";
import { apiBasePath } from "@/lib/api-contract";
import { formatRate, markedUpRates } from "@/lib/pricing";
import { routeLabels } from "@/lib/model-privacy";
import { models } from "@/lib/models";
import { providerNames, providerRoute, type ProviderId } from "@/lib/provider-catalog";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
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
      <span>{status || label}</span>
    </button>
  );
}

export function ModelCatalog({ availableProviders }: { availableProviders: ProviderId[] }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("featured");
  const displayed = models.filter((model) =>
    (model.name + " " + model.type + " " + model.id + " " + model.summary + " " + providerNames[model.provider])
      .toLowerCase()
      .includes(filter.toLowerCase().trim()),
  );
  if (sort === "input") displayed.sort((a, b) => a.input - b.input);
  if (sort === "output") displayed.sort((a, b) => a.output - b.output);
  return (
    <>
      <div className="catalog-tools">
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
        <select aria-label="Sort models" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="featured">Featured</option>
          <option value="input">Lowest input price</option>
          <option value="output">Lowest output price</option>
        </select>
      </div>
      <p className="catalog-count caption" role="status">
        {displayed.length} {displayed.length === 1 ? "model" : "models"}
      </p>
      {displayed.length > 0 && (
        <div className="panel catalog-list" id="model-rates">
          <table aria-label="Model rates and context" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Model
                </th>
                <th role="columnheader" scope="col">
                  Context
                </th>
                <th role="columnheader" scope="col">
                  Input / 1M
                </th>
                <th role="columnheader" scope="col">
                  Cached / 1M
                </th>
                <th role="columnheader" scope="col">
                  Output / 1M
                </th>
                <th role="columnheader" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {displayed.map((model) => {
                const routes = availableProviders.filter((id) => providerRoute(model, id));
                return (
                  <tr role="row" key={model.id}>
                    <th role="rowheader" scope="row">
                      <div className="catalog-identity">
                        <span aria-hidden="true" className={"model-mark " + model.color}>
                          {model.mark}
                        </span>
                        <div>
                          <h3>{model.name}</h3>
                          {model.summary && <p>{model.summary}</p>}
                          <span className="model-tier">{routeLabels[model.privacyRoute]} · {providerNames[model.provider]}</span>
                        </div>
                      </div>
                    </th>
                    {(
                      [
                        ["Context", model.context],
                        ["Input / 1M", formatRate(markedUpRates(model).input)],
                        ["Cached / 1M", formatRate(markedUpRates(model).cache)],
                        ["Output / 1M", formatRate(markedUpRates(model).output)],
                      ] as const
                    ).map(([label, value]) => (
                      <td role="cell" key={label} className="catalog-value">
                        <span className="catalog-mobile-label" aria-hidden="true">
                          {label}
                        </span>
                        <span>{value}</span>
                      </td>
                    ))}
                    <td role="cell" className="catalog-actions">
                      <div className="catalog-row-actions">
                        {routes.length > 0 ? (
                          <Link href={"/console?model=" + encodeURIComponent(model.id)} className="text-link">
                            Open in chat <ArrowUpRight size={15} />
                          </Link>
                        ) : (
                          <span className="caption">Unavailable</span>
                        )}
                        <CopyButton value={model.id} label="Copy model ID" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!displayed.length && (
        <p className="empty" role="status">
          No models match your search.
        </p>
      )}
      <p className="caption">
        Displayed rates include Sonnely’s 10% markup on compute costs. Sonnely forwards text requests through
        its HTTPS gateway. <Link href="/docs/attestation#data-handling">Read how data is handled ↗</Link>
      </p>
    </>
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
