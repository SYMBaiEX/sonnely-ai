// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { HighlightedCode } from "../../syntax.tsx";
import { apiBasePath } from "./data.ts";
import { entryActions, pages, platformLinks, traceStages } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { Scene } from "./scene.tsx";
import { buttonAccent, buttonQuiet, textLink, wrap } from "./ui.ts";
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

const requestPath = [
  ["Send", "Request", "Send one OpenAI-compatible request."],
  ["Cpu", "Execution", "Sonnely routes it to confidential compute."],
  ["ReceiptText", "Settlement", "Follow the trace and see the charge."],
] as const;

function jumpToSection(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const hash = event.currentTarget.hash;
  const section = document.getElementById(hash.slice(1));
  if (!section) return;
  event.preventDefault();
  history.replaceState(history.state, "", hash);
  section.focus({ preventScroll: true });
  section.scrollIntoView();
}

function Hero() {
  const [title, description] = pages.inference;
  const entry = entryActions.inference;
  return (
    <header className="inference-hero">
      <div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p className="inference-hero-description">{description}</p>
        <div className="actions">
          <a href={entry.next} className={buttonAccent}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
          <a href={entry.section} className={textLink} onClick={jumpToSection}>
            Explore routing <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <figure className="inference-brief">
        <figcaption>
          <span>One request, end to end</span>
          <code>POST {apiBasePath}/chat/completions</code>
        </figcaption>
        <ol>
          {requestPath.map(([icon, label, detail]) => (
            <li key={label}>
              <span>
                <ProductIcon name={icon} size={19} />
              </span>
              <div>
                <strong>{label}</strong>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </figure>
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
  rows,
  label,
}: {
  rows: readonly (readonly [string, string])[];
  label: string;
}) {
  return (
    <figure className="inference-factcard">
      <figcaption>{label}</figcaption>
      <Facts rows={rows} />
    </figure>
  );
}

function CodeWindow({
  tag,
  source,
  language,
  label,
}: {
  tag: string;
  source: string;
  language: "http" | "json";
  label: string;
}) {
  return (
    <figure className="inference-term">
      <figcaption>
        <span>{label}</span>
        <code>{tag}</code>
      </figcaption>
      <pre className="inference-code" tabIndex={0} aria-label={label}>
        <HighlightedCode source={source} language={language} />
      </pre>
    </figure>
  );
}

function Section({
  id,
  title,
  href,
  action,
  wide = false,
  children,
}: {
  id: string;
  title: string;
  href: string;
  action: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="inference-section" aria-labelledby={id + "-heading"} tabIndex={-1}>
      <h2 id={id + "-heading"}>{title}</h2>
      <div className={wide ? "inference-wide" : "inference-split"}>{children}</div>
      <a href={href} className={textLink}>
        {action} <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </section>
  );
}

const traceTotal = traceStages[traceStages.length - 1].end;

function TracePreview() {
  const [active, setActive] = useState(1);
  const selected = traceStages[active];
  return (
    <figure className="inference-trace">
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
              <span>{name}</span>
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
        title="Confidential routing"
        href="/models#available-models"
        action="Compare models and prices"
      >
        <div className="inference-copy">
          <p>
            Every request runs on confidential compute selected by the gateway. Choose a model ID
            from the catalog; Sonnely routes it to an available attested execution environment and
            meters the tokens it reports back.
          </p>
        </div>
        <CodeWindow
          tag="Chat Completions"
          label="Example request and response"
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
        title="Streaming and cost limits"
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
          tag="JSON"
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
        title="The privacy boundary"
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
          label="What each component handles"
          rows={[
            ["sonnely gateway", "validation, forwarding, settlement"],
            ["confidential tee", "model execution"],
            ["receipt", "route evidence"],
          ]}
        />
      </Section>
      <Section
        id="traces"
        title="Request traces"
        href="/docs/observability"
        action="Read the observability guide"
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
        title="Workspace usage"
        href="/docs/observability"
        action="Read the usage guide"
      >
        <div className="inference-copy">
          <p>
            See spend, tokens, and request counts for the UTC date range you choose. Export up to
            100 settled requests as a batch for your own analytics, or download the loaded rows as
            CSV.
          </p>
        </div>
        <FactCard
          label="Usage report options"
          rows={[
            ["breakdown", "by model, provider, or key"],
            ["range", "utc date range"],
            ["export", "csv · usage batch"],
          ]}
        />
      </Section>
      <Section
        id="logs"
        title="Request logs and charges"
        href="/docs/observability"
        action="Read the request logs guide"
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
          tag="HTTP"
          label="Example response headers"
          source={["x-sonnely-request-id: sr_9f2c…", "x-sonnely-provider: tinfoil"].join("\n")}
          language="http"
        />
      </Section>
      <Section
        id="batch"
        title="Batch inference"
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
          label="Batch run limits and output"
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
  ["routing", "Routing"],
  ["streaming", "Streaming"],
  ["evidence", "Privacy boundary"],
  ["traces", "Traces"],
  ["usage", "Usage"],
  ["logs", "Request logs"],
  ["batch", "Batch"],
] as const;

export function InferencePage() {
  return (
    <div className={wrap + " inference-page"}>
      <Hero />
      <div>
        <nav className="inference-nav" aria-label="On this page">
          <p aria-hidden="true">On this page</p>
          {sections.map(([id, label]) => (
            <a key={id} href={"#" + id} onClick={jumpToSection}>{label}</a>
          ))}
        </nav>
        <div>
          <Inference />
        </div>
      </div>
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
