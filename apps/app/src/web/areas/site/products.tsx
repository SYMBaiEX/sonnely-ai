// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { HighlightedCode } from "../../syntax.tsx";
import { SiteLead, type SiteBrief } from "./chrome.tsx";
import { apiBasePath } from "./data.ts";
import { entryActions, pages, platformLinks, traceStages, type ProductPageId } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { buttonAccent, caption, textLink, wrap } from "./ui.ts";

export function PlatformLinks({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <section className={"product-related " + className} aria-labelledby="platform-links-heading">
        <div className="product-indexIntro" data-reveal="rise">
          <h2 id="platform-links-heading">Explore the platform</h2>
        </div>
        <ul className="directory-modules compact" role="list">
          {platformLinks.map(({ href, label, description, icon }) => (
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
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className={"section product-index " + className} aria-labelledby="platform-links-heading">
      <div className="product-indexIntro" data-reveal="rise">
        <h2 id="platform-links-heading">Inference, from API to operations.</h2>
        <p>Choose a model route and understand each request.</p>
      </div>
      <ul className="directory-modules" role="list">
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
    <section id={id} className="term module" aria-labelledby={id + "-heading"}>
      <div className="term-chrome">
        <span className="term-path">
          <ProductIcon name={icon} size={13} /> {path}
        </span>
        <span className="module-ordinal" aria-hidden="true">
          {index}
        </span>
      </div>
      <div className="module-body">
        <h2 id={id + "-heading"} className="module-title">
          {title}
        </h2>
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
    <figure className="term module-trace" data-scan>
      <figcaption className="term-chrome">
        <span className="term-path">
          <i className="term-dot" aria-hidden="true" /> example trace · {(total / 1000).toFixed(1)} s
        </span>
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

function Observability() {
  return (
    <>
      <Module id="traces" index="01" path="~/observability/traces" icon="Radio" title="Follow the whole request.">
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
            Trace data contains timing, route, and billing metadata. Prompts and responses stay out
            of UsageMax receipts. Workspace users can see their own tokens and charges in Usage.
            Gateway traces and compute costs are restricted to authorized operators.
          </p>
        </div>
      </Module>
      <Module id="analytics" index="02" path="~/observability/analytics" icon="Activity" title="Compare models and days.">
        <div className="module-copy">
          <p>
            Group the private report by model or UTC day. Compare attempts, errors, input and output
            tokens, p50, p95 and p99 latency, first-token time, and known compute cost. Cost coverage
            shows how many requests have evidence. Margin covers only requests with both charges and
            known costs.
          </p>
          <NextLink href="/docs/observability#export-to-usagemax">Export your workspace usage</NextLink>
        </div>
        <div className="module-artifact">
          <ModuleFacts
            rows={[
              ["group by", "model · utc day"],
              ["window", "up to 30 days"],
              ["coverage", "up to 2,000 receipts"],
            ]}
          />
        </div>
      </Module>
      <Module id="reconciliation" index="03" path="~/observability/reconciliation" icon="ReceiptText" title="Reconcile a statement.">
        <div className="module-copy">
          <p>
            Operators preview finalized invoice lines against Sonnely’s billing references. Matches,
            cost variances, duplicate references, and unmatched lines have separate outcomes.
            Recording the statement publishes eligible invoice-confirmed cost revisions to UsageMax
            and keeps an audit history in Sonnely.
          </p>
          <p className="module-note">
            Customer charges, credit balances, and treasury payout amounts follow the Sonnely
            ledger.
          </p>
        </div>
        <div className="module-artifact">
          <ModuleCode
            label="normalized invoice line · example"
            source={"reference,cost_usd\nprovider-request-id,0.000042"}
            language="csv"
          />
        </div>
      </Module>
      <Module id="alerts" index="04" path="~/observability/alerts" icon="Activity" title="Surface problems early.">
        <div className="module-copy">
          <p>
            Scheduled alerts flag request errors, high latency, and pending billing recovery. Admin
            shows open and resolved incidents alongside the current state of receipt delivery.
          </p>
          <p className={caption + " module-caption"}>
            Alerts use at least five attempts in the previous hour.
          </p>
        </div>
        <div className="module-artifact">
          <ModuleFacts
            rows={[
              ["evaluation interval", "5 minutes"],
              ["error rate", "20%"],
              ["p95 latency", "5 seconds"],
            ]}
          />
        </div>
      </Module>
      <Module id="evaluations" index="05" path="~/observability/evaluations" icon="Code2" title="Evaluate before you roll out.">
        <div className="module-copy">
          <p>
            UsageMax includes a versioned gateway eval runner. Use synthetic fixtures for CI
            regression checks, or run explicit live measurements against Sonnely with a request
            budget and a reviewed baseline. Results include pass status, token counts, charge, and
            latency.
          </p>
          <NextLink href="/blog/choose-a-model">Plan a small evaluation</NextLink>
        </div>
      </Module>
    </>
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
    </>
  );
}

const pageContent: Record<ProductPageId, () => ReactNode> = {
  inference: Inference,
  observability: Observability,
};

const pageSections: Record<ProductPageId, readonly (readonly [string, string])[]> = {
  inference: [
    ["routing", "routing"],
    ["streaming", "streaming"],
    ["evidence", "privacy boundary"],
  ],
  observability: [
    ["traces", "traces"],
    ["analytics", "analytics"],
    ["reconciliation", "reconciliation"],
    ["alerts", "alerts"],
    ["evaluations", "evaluations"],
  ],
};

const pageBriefs: Record<ProductPageId, SiteBrief> = {
  inference: {
    title: "Inference API",
    rows: [
      ["Interface", "Chat Completions"],
      ["Routing", "Automatic"],
      ["Response", "Completion or stream"],
    ],
  },
  observability: {
    title: "Request lifecycle",
    rows: [
      ["Track", "Provider attempts"],
      ["Measure", "Latency, tokens, cost"],
      ["Reconcile", "UsageMax receipts"],
    ],
  },
};

const directoryBriefs = {
  "/inference": pageBriefs.inference,
  "/observability": pageBriefs.observability,
} as const;

export function ProductPage({ page }: { page: ProductPageId }) {
  const [title, description] = pages[page];
  const entry = entryActions[page];
  const sections = pageSections[page];
  const Content = pageContent[page];
  return (
    <div className={wrap + " inner-page market-page"}>
      <SiteLead
        title={title}
        description={description}
        brief={pageBriefs[page]}
      >
        {entry && (
          <div className="product-entry-actions">
            <a href={entry.section} className={buttonAccent}>
              {entry.label} <ArrowDown size={15} aria-hidden="true" />
            </a>
            <a href={entry.next} className={textLink}>
              {entry.action} <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        )}
      </SiteLead>
      <nav className="module-index" aria-label="On this page">
        <span className="module-index-path">~/{page}</span>
        {sections.map(([id, label], position) => (
          <a key={id} href={"#" + id}>
            <span aria-hidden="true">{String(position + 1).padStart(2, "0")}</span> {label}
          </a>
        ))}
      </nav>
      <div className="module-directory">
        <Content />
      </div>
      <PlatformLinks compact />
    </div>
  );
}
