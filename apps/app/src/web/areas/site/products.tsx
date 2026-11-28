// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Terminal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { HighlightedCode } from "../../syntax.tsx";
import { apiBasePath } from "./data.ts";
import { entryActions, pages, platformLinks, traceStages } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { Scene } from "./scene.tsx";
import { buttonAccent, buttonQuiet, sectionHead, textLink, wrap } from "./ui.ts";
import "./inference.css";

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

const inferenceBriefRows = [
  ["Interface", "Chat Completions"],
  ["Routing", "Automatic"],
  ["Response", "Completion or stream"],
  ["Trace", "Every request"],
] as const;

const directoryBriefs = {
  "/inference": {
    title: "Inference API",
    rows: inferenceBriefRows,
  },
} as const;

function Hero() {
  const [title, description] = pages.inference;
  const entry = entryActions.inference;
  return (
    <header className="inference-hero">
      <div className="inference-hero-copy">
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p className="inference-hero-description">{description}</p>
        <div className="actions">
          <a href={entry.section} className={buttonAccent}>
            {entry.label} <ArrowDown size={16} aria-hidden="true" />
          </a>
          <a href={entry.next} className={buttonQuiet}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
      <aside className="term inference-brief" data-scan aria-label="Inference at a glance">
        <div className="term-chrome">
          <span className="term-path">
            <Terminal size={13} aria-hidden="true" /> ~/inference
            <span className="term-caret" aria-hidden="true" />
          </span>
        </div>
        <dl className="inference-brief-rows">
          {inferenceBriefRows.map(([fact, value]) => (
            <div key={fact}>
              <dt>{fact}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </header>
  );
}

function Facts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="inference-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FactCard({
  path,
  icon,
  rows,
  label,
}: {
  path: string;
  icon: string;
  rows: readonly (readonly [string, string])[];
  label: string;
}) {
  return (
    <figure className="preview-data inference-factcard" aria-label={label} data-reveal="fade">
      <figcaption>
        <ProductIcon name={icon} size={15} aria-hidden="true" /> <strong>{path}</strong>
      </figcaption>
      <div className="preview-body">
        <dl>
          {rows.map(([fact, value]) => (
            <div key={fact}>
              <dt>{fact}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </figure>
  );
}

function CodeWindow({
  path,
  tag,
  source,
  language,
  label,
}: {
  path: string;
  tag: string;
  source: string;
  language: "http" | "json";
  label: string;
}) {
  return (
    <figure className="term inference-term" data-scan aria-label={label} data-reveal="fade">
      <div className="term-chrome">
        <span className="term-path">
          <Terminal size={13} aria-hidden="true" /> {path}
          <span className="term-caret" aria-hidden="true" />
        </span>
        <span className="inference-term-tag" aria-hidden="true">
          {tag}
        </span>
      </div>
      <pre className="inference-code">
        <HighlightedCode source={source} language={language} />
      </pre>
    </figure>
  );
}

function Section({
  id,
  index,
  icon,
  title,
  href,
  action,
  wide = false,
  children,
}: {
  id: string;
  index: string;
  icon: string;
  title: string;
  href: string;
  action: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section inference-section" aria-labelledby={id + "-heading"}>
      <header className={sectionHead}>
        <div>
          <p className="inference-stage">
            <ProductIcon name={icon} size={12} aria-hidden="true" /> {index} · {id}
          </p>
          <h2 id={id + "-heading"}>{title}</h2>
        </div>
        <a href={href} className={textLink}>
          {action} <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <div className={wide ? "inference-wide" : "inference-split"}>{children}</div>
    </section>
  );
}

const traceTotal = traceStages[traceStages.length - 1].end;

function TracePreview() {
  const [active, setActive] = useState(1);
  const selected = traceStages[active];
  return (
    <figure className="inference-trace" data-reveal="fade">
      <figcaption className="gateway-trace-head">
        <span className="gateway-trace-label">
          <i className="gateway-trace-dot" aria-hidden="true" /> example trace ·{" "}
          {(traceTotal / 1000).toFixed(1)} s
        </span>
        <span className="inference-trace-firsttoken">first token 780 ms</span>
        <span className="gateway-trace-outcome">
          <Check size={12} aria-hidden="true" /> settled
        </span>
      </figcaption>
      <div className="gateway-trace-bar" aria-hidden="true">
        {traceStages.map(({ name, start, end }) => (
          <span
            key={name}
            className={
              "gateway-trace-segment gateway-trace-segment-" + name.split(" ")[0].toLowerCase()
            }
            style={{
              insetInlineStart: (start / traceTotal) * 100 + "%",
              width: ((end - start) / traceTotal) * 100 + "%",
            }}
          />
        ))}
        <span className="gateway-trace-scan" />
      </div>
      <ol className="inference-trace-stages">
        {traceStages.map(({ name, start, end, icon }, index) => (
          <li key={name}>
            <button
              type="button"
              aria-pressed={active === index}
              aria-controls="inference-trace-detail"
              onClick={() => setActive(index)}
            >
              <ProductIcon name={icon} size={13} aria-hidden="true" />
              <span className="inference-trace-name">{name}</span>
              <span className="inference-trace-ms">{end - start} ms</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="inference-trace-detail" id="inference-trace-detail" aria-live="polite">
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
      <Section
        id="routing"
        index="01"
        icon="Radio"
        title="Sonnely picks the route."
        href="/models#available-models"
        action="Compare models and prices"
      >
        <div className="inference-copy">
          <p>
            Every request runs on confidential compute selected by the gateway. Choose a model ID
            from the catalog; Sonnely routes it to an available attested execution environment and
            meters the tokens it reports back.
          </p>
          <Facts
            rows={[
              ["model", "catalog id"],
              ["route", "automatic confidential"],
              ["budget", "optional per-request cap"],
            ]}
          />
        </div>
        <CodeWindow
          path="~/inference/routing"
          tag={"post " + apiBasePath + "/chat/completions"}
          label="Chat Completions request and response"
          source={[
            '→ { "model": "deepseek-ai/DeepSeek-V4.1-Flash-1017",',
            '    "messages": [{ "role": "user", "content": "…" }] }',
            "",
            '← { "choices": [{ "message": { "content": "…" } }],',
            '    "usage": { "prompt_tokens": 18, "completion_tokens": 64 } }',
          ].join("\n")}
          language="http"
        />
      </Section>
      <Section
        id="streaming"
        index="02"
        icon="Activity"
        title="Stream with a budget."
        href="/docs/streaming"
        action="Read the streaming guide"
      >
        <div className="inference-copy">
          <p>
            Use the Sonnely SDK or a Chat Completions client with streaming enabled. Ask for final
            usage when consuming the stream. Set a cap for one request with{" "}
            <code>max_cost_microusd</code>, alongside daily and lifetime limits on the API key.
          </p>
        </div>
        <CodeWindow
          path="~/inference/streaming"
          tag="json · stream options"
          label="Streaming request fragment"
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
      </Section>
      <Section
        id="evidence"
        index="03"
        icon="Fingerprint"
        title="Know the privacy boundary."
        href="/docs/attestation"
        action="Review attestation evidence"
      >
        <div className="inference-copy">
          <p>
            A trusted execution environment protects the model while it runs. Sonnely’s HTTPS
            gateway can read the request while forwarding it. Each route supplies its own evidence,
            so verify the claim in the optional Sonnely receipt before relying on a specific
            attestation guarantee.
          </p>
        </div>
        <FactCard
          path="~/inference/evidence"
          icon="Fingerprint"
          label="Privacy boundary roles"
          rows={[
            ["sonnely gateway", "validation, forwarding, settlement"],
            ["confidential tee", "model execution"],
            ["receipt", "route evidence"],
          ]}
        />
      </Section>
      <Section
        id="traces"
        index="04"
        icon="Radio"
        title="Follow the whole request."
        href="/docs/observability"
        action="Read the usage guide"
        wide
      >
        <div className="inference-copy">
          <p>
            See where a request spent time, from reserving credits and executing the request to
            evidence verification and settlement. A pending billing hold stays visible while it is
            investigated.
          </p>
        </div>
        <TracePreview />
        <div className="inference-copy">
          <p className="inference-note">
            Trace data contains timing, route, and billing metadata — never prompt or response
            text. Your own tokens and charges are in Usage and Request logs; fleet-wide traces and
            provider compute costs stay with authorized operators.
          </p>
        </div>
      </Section>
      <Section
        id="usage"
        index="05"
        icon="Activity"
        title="Measure what you spend."
        href="/docs/observability"
        action="Read the usage guide"
      >
        <div className="inference-copy">
          <p>
            Usage groups your workspace’s settled requests by model or UTC day: spend, tokens and
            request counts over the date range you choose. Export up to 100 settled requests as a
            batch for your own analytics, or download the loaded rows as CSV.
          </p>
        </div>
        <FactCard
          path="~/inference/usage"
          icon="Activity"
          label="Usage breakdown shape"
          rows={[
            ["breakdown", "by model · by key"],
            ["range", "utc date range"],
            ["export", "csv · usage batch"],
          ]}
        />
      </Section>
      <Section
        id="logs"
        index="06"
        icon="ReceiptText"
        title="Settle every request in the open."
        href="/docs/observability"
        action="Inspect request logs"
      >
        <div className="inference-copy">
          <p>
            Every response carries an <code>X-Sonnely-Request-Id</code> header. Paste it into
            Request logs to see what the request was charged — charged, still reserved, or released
            after a failure — and filter your workspace history by date range or provider before
            exporting the rows.
          </p>
        </div>
        <CodeWindow
          path="~/inference/logs"
          tag="http · response headers"
          label="Response headers on every request"
          source={["x-sonnely-request-id: sr_9f2c…", "x-sonnely-provider: tinfoil"].join("\n")}
          language="http"
        />
      </Section>
      <Section
        id="batch"
        index="07"
        icon="Code2"
        title="Run inference in batch."
        href="/docs/batch"
        action="Read the batch guide"
      >
        <div className="inference-copy">
          <p>
            Upload up to 200 nonstreaming Chat Completions requests as JSONL and run them against
            your workspace credits, one at a time. The browser checkpoints progress, so an
            interrupted run resumes where it stopped, and completed responses export as JSONL.
          </p>
        </div>
        <FactCard
          path="~/inference/batch"
          icon="Code2"
          label="Batch run shape"
          rows={[
            ["rows", "up to 200 requests"],
            ["resume", "browser checkpoint"],
            ["results", "jsonl export"],
          ]}
        />
      </Section>
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

export function InferencePage() {
  return (
    <div className={wrap + " inference-page"}>
      <Hero />
      <nav className="inference-nav" aria-label="On this page">
        <span className="inference-nav-path" aria-hidden="true">
          <Terminal size={12} /> ~/inference
        </span>
        {sections.map(([id, label], position) => (
          <a key={id} href={"#" + id}>
            <span aria-hidden="true">{String(position + 1).padStart(2, "0")}</span> {label}
          </a>
        ))}
      </nav>
      <Inference />
      <section className="closing inference-closing" aria-labelledby="inference-closing-heading">
        <Scene />
        <div>
          <h2 id="inference-closing-heading">Send your first request.</h2>
          <p>
            Create an API key, pick a model from the catalog, and trace the call end to end.
          </p>
        </div>
        <div className="actions">
          <a className={buttonAccent} href="/console/keys">
            Create an API key <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a className={buttonQuiet} href="/docs/quickstart">
            Quickstart <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
