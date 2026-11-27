// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { HighlightedCode } from "../../syntax.tsx";
import { CorrespondenceHero, type SiteBrief } from "./chrome.tsx";
import { apiBasePath } from "./data.ts";
import { entryActions, pages, platformLinks, traceStages } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { textLink, wrap } from "./ui.ts";

export function PlatformLinks({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <section
      className={(compact ? "product-related " : "section product-index ") + className}
      aria-labelledby="platform-links-heading"
    >
      <div className="product-indexIntro" data-reveal="rise">
        {compact ? (
          <h2 id="platform-links-heading">Explore the platform</h2>
        ) : (
          <>
            <h2 id="platform-links-heading">Inference, from API to operations.</h2>
            <p>Choose a model route and understand each request.</p>
          </>
        )}
      </div>
      <ul className={compact ? "directory-modules compact" : "directory-modules"} role="list">
        {platformLinks.map(({ href, label, description, icon }) => {
          const brief = directoryBriefs[href];
          return (
            <li key={href}>
              <a href={href}>
                <span className="directory-module-head">
                  <span className="directory-path">
                    <ProductIcon name={icon} size={14} /> ~{href}
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>
                <strong>{label}</strong>
                <small>{description}</small>
                <dl className="directory-facts">
                  {brief.rows.map(([fact, value]) => (
                    <div key={fact}>
                      <dt>{fact}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Module({
  id,
  index,
  path,
  icon,
  title,
  children,
}: {
  id: string;
  index: string;
  path: string;
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="module" aria-labelledby={id + "-heading"}>
      <div className="module-body">
        <header className="module-head">
          <span className="module-kicker">
            <ProductIcon name={icon} size={13} /> {index} · {path}
          </span>
          <h2 id={id + "-heading"} className="module-title">
            {title}
          </h2>
        </header>
        {children}
      </div>
    </section>
  );
}

function ModuleFacts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="directory-facts module-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModuleCode({
  label,
  source,
  language,
}: {
  label: string;
  source: string;
  language: "http" | "json" | "csv";
}) {
  return (
    <figure className="module-code">
      <figcaption className="module-code-head">
      <span className="module-code-label">{label}</span>
        <span className="module-code-lang" aria-hidden="true">
          {language}
        </span>
      </figcaption>
      <pre>
        <HighlightedCode source={source} language={language} />
      </pre>
    </figure>
  );
}

function NextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={textLink + " module-next"}>
      {children} <ArrowRight size={15} aria-hidden="true" />
    </a>
  );
}

export function TracePreview() {
  const [active, setActive] = useState(1);
  const selected = traceStages[active];
  const total = traceStages[traceStages.length - 1].end;
  return (
    <figure className="module-trace">
      <figcaption className="module-trace-head">
        <span>example trace · {(total / 1000).toFixed(1)} s</span>
        <span className="module-trace-outcome">
          <Check size={12} aria-hidden="true" /> settled
        </span>
      </figcaption>
      <dl className="module-trace-metrics">
        <div>
          <dt>first token</dt>
          <dd>780 ms</dd>
        </div>
        <div>
          <dt>gateway time</dt>
          <dd>{(total / 1000).toFixed(1)} s</dd>
        </div>
      </dl>
      <ol className="module-waterfall">
        {traceStages.map(({ name, start, end, icon }, index) => (
          <li key={name}>
            <button type="button" aria-pressed={active === index} onClick={() => setActive(index)}>
              <span className="module-trace-label">
                <ProductIcon name={icon} size={14} /> {name.toLowerCase()}
              </span>
              <span className="module-trace-track" aria-hidden="true">
                <span
                  style={{
                    insetInlineStart: (start / total) * 100 + "%",
                    width: ((end - start) / total) * 100 + "%",
                  }}
                />
              </span>
              <span className="module-trace-ms">{end - start} ms</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="module-trace-detail" aria-live="polite">
        <div>
          <strong>{selected.name.toLowerCase()}</strong>{" "}
          <span>
            {selected.start.toLocaleString("en-US")}–{selected.end.toLocaleString("en-US")} ms
          </span>
        </div>
        <p>{selected.detail}</p>
      </div>
    </figure>
  );
}

function Inference() {
  return (
    <>
      <Module id="routing" index="01" path="~/inference/routing" icon="Radio" title="Sonnely picks the route.">
        <div className="module-copy">
          <p>
            Every request runs on confidential compute selected by the gateway. Choose a model ID
            from the catalog; Sonnely routes it to an available attested execution environment and
            meters the tokens it reports back.
          </p>
          <ModuleFacts
            rows={[
              ["model", "catalog id"],
              ["route", "automatic confidential"],
              ["budget", "optional per-request cap"],
            ]}
          />
          <NextLink href="/models#available-models">Compare models and prices</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleCode
            label={"post " + apiBasePath + "/chat/completions"}
            source={[
              '→ { "model": "deepseek-ai/DeepSeek-V4.1-Flash-1017",',
              '    "messages": [{ "role": "user", "content": "…" }] }',
              "",
              '← { "choices": [{ "message": { "content": "…" } }],',
              '    "usage": { "prompt_tokens": 18, "completion_tokens": 64 } }',
            ].join("\n")}
            language="http"
          />
        </div>
      </Module>
      <Module id="streaming" index="02" path="~/inference/streaming" icon="Activity" title="Stream with a budget.">
        <div className="module-copy">
          <p>
            Use the Sonnely SDK or a Chat Completions client with streaming enabled. Ask for final
            usage when consuming the stream. Set a cap for one request with{" "}
            <code>max_cost_microusd</code>, alongside daily and lifetime limits on the API key.
          </p>
          <NextLink href="/docs/streaming">Read the streaming guide</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleCode
            label="request fragment · stream options"
            source={JSON.stringify(
              {
                stream: true,
                stream_options: { include_usage: true },
                max_cost_microusd: 500,
              },
              null,
              2,
            )}
            language="json"
          />
        </div>
      </Module>
      <Module id="evidence" index="03" path="~/inference/evidence" icon="Fingerprint" title="Know the privacy boundary.">
        <div className="module-copy">
          <p>
            A trusted execution environment protects the model while it runs. Sonnely’s HTTPS
            gateway can read the request while forwarding it. Each route supplies its own evidence,
            so verify the claim in the optional Sonnely receipt before relying on a specific
            attestation guarantee.
          </p>
          <NextLink href="/docs/attestation">Review attestation evidence</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleFacts
            rows={[
              ["sonnely gateway", "validation, forwarding, settlement"],
              ["confidential tee", "model execution"],
              ["receipt", "route evidence"],
            ]}
          />
        </div>
      </Module>
      <Module id="traces" index="04" path="~/inference/traces" icon="Radio" title="Follow the whole request.">
        <div className="module-copy wide">
          <p>
            See where a request spent time, from reserving credits and executing the request to
            evidence verification and settlement. A pending billing hold stays visible while it is
            investigated.
          </p>
        </div>
        <TracePreview />
        <div className="module-copy wide">
          <p className="module-note">
            Trace data contains timing, route, and billing metadata — never prompt or response
            text. Your own tokens and charges are in Usage and Request logs; fleet-wide traces and
            provider compute costs stay with authorized operators.
          </p>
        </div>
      </Module>
      <Module id="usage" index="05" path="~/inference/usage" icon="Activity" title="Measure what you spend.">
        <div className="module-copy">
          <p>
            Usage groups your workspace’s settled requests by model or UTC day: spend, tokens and
            request counts over the date range you choose. Export up to 100 settled requests as a
            batch for your own analytics, or download the loaded rows as CSV.
          </p>
          <NextLink href="/docs/observability">Read the usage guide</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleFacts
            rows={[
              ["breakdown", "by model · by key"],
              ["range", "utc date range"],
              ["export", "csv · usage batch"],
            ]}
          />
        </div>
      </Module>
      <Module id="logs" index="06" path="~/inference/logs" icon="ReceiptText" title="Settle every request in the open.">
        <div className="module-copy">
          <p>
            Every response carries an <code>X-Sonnely-Request-Id</code> header. Paste it into
            Request logs to see what the request was charged — charged, still reserved, or released
            after a failure — and filter your workspace history by date range or provider before
            exporting the rows.
          </p>
          <NextLink href="/docs/observability">Inspect request logs</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleCode
            label="response headers · every request"
            source={["x-sonnely-request-id: sr_9f2c…", "x-sonnely-provider: tinfoil"].join("\n")}
            language="http"
          />
        </div>
      </Module>
      <Module id="batch" index="07" path="~/inference/batch" icon="Code2" title="Run inference in batch.">
        <div className="module-copy">
          <p>
            Upload up to 200 nonstreaming Chat Completions requests as JSONL and run them against
            your workspace credits, one at a time. The browser checkpoints progress, so an
            interrupted run resumes where it stopped, and completed responses export as JSONL.
          </p>
          <NextLink href="/docs/batch">Read the batch guide</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleFacts
            rows={[
              ["rows", "up to 200 requests"],
              ["resume", "browser checkpoint"],
              ["results", "jsonl export"],
            ]}
          />
        </div>
      </Module>
    </>
  );
}

const sections = [
  ["routing", "routing"],
  ["streaming", "streaming"],
  ["evidence", "privacy boundary"],
  ["traces", "traces"],
  ["usage", "usage"],
  ["logs", "request logs"],
  ["batch", "batch"],
] as const;

const inferenceBrief: SiteBrief = {
  title: "Inference API",
  rows: [
    ["Interface", "Chat Completions"],
    ["Routing", "Automatic"],
    ["Response", "Completion or stream"],
    ["Trace", "Every request"],
  ],
};

const directoryBriefs = {
  "/inference": inferenceBrief,
} as const;

export function InferencePage() {
  const [title, description] = pages.inference;
  const entry = entryActions.inference;
  return (
    <div className={wrap + " cor-page cor-market-page inference-page"}>
      <CorrespondenceHero
        eyebrow="Inference API · Sonnely"
        title={title}
        description={description}
        brief={inferenceBrief}
        actionsLabel="Inference actions"
        asideLabel="Inference at a glance"
      >
        <a href={entry.section} className="cor-primary-action">
          {entry.label} <ArrowDown size={15} aria-hidden="true" />
        </a>
        <a href={entry.next}>
          {entry.action} <ArrowRight size={15} aria-hidden="true" />
        </a>
      </CorrespondenceHero>
      <nav className="module-index" aria-label="On this page">
        <span className="module-index-path">~/inference</span>
        {sections.map(([id, label], position) => (
          <a key={id} href={"#" + id}>
            <span aria-hidden="true">{String(position + 1).padStart(2, "0")}</span> {label}
          </a>
        ))}
      </nav>
      <div className="module-directory">
        <Inference />
      </div>
    </div>
  );
}
