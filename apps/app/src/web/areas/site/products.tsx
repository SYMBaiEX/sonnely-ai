// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { HighlightedCode } from "../../syntax.tsx";
import { apiBasePath } from "./data.ts";
import { entryActions, pages, platformLinks, traceStages } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { buttonAccent, textLink, wrap } from "./ui.ts";
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
  ["Send", "Request"],
  ["Cpu", "Confidential compute"],
  ["ReceiptText", "Trace and charge"],
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
  const [title] = pages.inference;
  const entry = entryActions.inference;
  return (
    <header className="inference-hero">
      <div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p className="inference-hero-description">
          Use an OpenAI-compatible client to run models on confidential compute, stream responses,
          and see what each request cost.
        </p>
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
          {requestPath.map(([icon, label]) => (
            <li key={label}>
              <ProductIcon name={icon} size={18} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
      </figure>
    </header>
  );
}

function CodeExample({
  source,
  language,
  label,
}: {
  source: string;
  language: "http" | "json";
  label: string;
}) {
  return (
    <figure className="inference-term">
      <figcaption>{label}</figcaption>
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
  example,
  children,
}: {
  id: string;
  title: string;
  href: string;
  action: string;
  example?: { content: ReactNode; placement: "beside" | "below" };
  children: ReactNode;
}) {
  return (
    <section id={id} className="inference-section" aria-labelledby={id + "-heading"} tabIndex={-1}>
      <div className={example?.placement === "beside" ? "inference-split" : "inference-wide"}>
        <div className="inference-copy">
          <h2 id={id + "-heading"}>{title}</h2>
          {children}
          <a href={href} className={textLink}>
            {action} <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        {example?.content}
      </div>
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
        title="How requests are routed"
        href="/models#available-models"
        action="Compare models and prices"
        example={{
          placement: "beside",
          content: (
            <CodeExample
              label="Chat Completions example"
              source={[
                '→ {',
                '    "model": "z-ai/glm-5.3-flash",',
                '    "messages": [',
                '      { "role": "user", "content": "…" }',
                '    ]',
                '  }',
                "",
                '← {',
                '    "choices": [',
                '      { "message": { "content": "…" } }',
                '    ],',
                '    "usage": {',
                '      "prompt_tokens": 18,',
                '      "completion_tokens": 64',
                '    }',
                '  }',
              ].join("\n")}
              language="http"
            />
          ),
        }}
      >
        <p>
          Choose a model ID from the catalog. Sonnely routes your request to an available attested
          environment and meters the tokens that environment reports.
        </p>
      </Section>
      <Section
        id="streaming"
        title="Streaming and cost limits"
        href="/docs/streaming"
        action="Read the streaming guide"
        example={{
          placement: "beside",
          content: (
            <CodeExample
              label="Streaming request options"
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
          ),
        }}
      >
        <p>
          Enable streaming in the Sonnely SDK or your Chat Completions client and request a final
          usage count. Cap a single request with <code>max_cost_microusd</code>, in addition to
          daily and lifetime limits on your API key.
        </p>
      </Section>
      <Section
        id="evidence"
        title="What confidential compute protects"
        href="/docs/attestation"
        action="Learn how to verify attestation"
      >
        <dl>
          <div>
            <dt>Sonnely HTTPS gateway</dt>
            <dd>Can read the request while forwarding it. Handles validation and settlement.</dd>
          </div>
          <div>
            <dt>Trusted execution environment</dt>
            <dd>Protects the model while it runs.</dd>
          </div>
        </dl>
        <p>
          Each route supplies its own evidence. Check the optional Sonnely receipt before relying
          on a specific attestation guarantee.
        </p>
      </Section>
      <Section
        id="traces"
        title="Request traces"
        href="/docs/observability"
        action="Read the observability guide"
        example={{ placement: "below", content: <TracePreview /> }}
      >
        <p>
          See where a request spent time. Traces contain timing, route, and billing metadata,
          never prompts or responses. Only authorized operators can see fleet-wide traces and
          provider compute costs.
        </p>
      </Section>
      <Section
        id="usage"
        title="Workspace usage"
        href="/docs/observability"
        action="Read the observability guide"
      >
        <p>
          See spend, tokens, and request counts by model, provider, or key for the UTC date range
          you choose. Export up to 100 settled requests as a batch, or download the loaded rows
          as CSV.
        </p>
      </Section>
      <Section
        id="logs"
        title="Request logs and charges"
        href="/docs/observability"
        action="Read the observability guide"
      >
        <p>
          Find the <code>X-Sonnely-Request-Id</code> response header and paste it into Request logs.
          You’ll see the charge, whether credits are still on hold during investigation, or
          whether they were released after a failure. Use <code>X-Sonnely-Provider</code> to
          identify the provider, then filter your history by provider or UTC date before exporting.
        </p>
      </Section>
      <Section
        id="batch"
        title="Batch inference"
        href="/docs/batch"
        action="Read the batch guide"
      >
        <p>
          Upload up to 200 nonstreaming Chat Completions requests in a JSONL file. The browser
          runs them one at a time against workspace credits, saves progress so you can resume an
          interrupted run, and exports completed responses as JSONL.
        </p>
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
  const entry = entryActions.inference;
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
      <section className="inference-closing" aria-labelledby="inference-closing-heading">
        <div>
          <h2 id="inference-closing-heading">Send your first request.</h2>
          <p>Set up your client, choose a model, and follow the call through to its charge.</p>
        </div>
        <div className="actions">
          <a className={buttonAccent} href={entry.next}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
          <a className={textLink} href="/console/keys">
            Create an API key <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
