// spec/app/site/index.md, "Story: Check the service status"
import { ArrowDown, ArrowRight, ArrowUpRight, CircleCheck, Fingerprint, Terminal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ReaderNavigation, SiteLead, type SiteBrief } from "./chrome.tsx";
import {
  artifactLimit,
  computeMarkup,
  computePlans,
  computeQuote,
  creditBalance,
} from "./data.ts";
import { entryActions, pages, platformLinks, traceStages, type ProductPageId } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import { buttonAccent, caption, textLink, wrap } from "./ui.ts";

export function PlatformLinks({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <section
      className={(compact ? "product-related" : "section product-index") + " " + className}
      aria-labelledby="platform-links-heading"
    >
      <div className="product-indexIntro" data-reveal="rise">
        <h2 id="platform-links-heading">
          {compact ? "Explore the platform" : "Inference, from API to operations."}
        </h2>
        {!compact && <p>Choose a model route, understand each request, and explore compute products.</p>}
      </div>
      <ul className="product-linkList" role="list">
        {platformLinks.map(({ href, label, description, icon }) => (
          <li key={href}>
            <a href={href}>
              <ProductIcon name={icon} size={20} />
              <span>
                <strong>{label}</strong>
                {!compact && <small>{description}</small>}
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="product-section" aria-labelledby={id + "-heading"}>
      <div className="product-sectionTitle" data-reveal="rise">
        <h2 id={id + "-heading"}>{title}</h2>
      </div>
      <div className="product-body">{children}</div>
    </section>
  );
}

function NextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={textLink}>
      {children} <ArrowRight size={15} aria-hidden="true" />
    </a>
  );
}

function ProductSample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="panel product-sample" data-reveal="rise">
      <figcaption>{label}</figcaption>
      {children}
    </figure>
  );
}

function SampleFacts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="product-sampleStats">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TracePreview() {
  const [active, setActive] = useState(1);
  const selected = traceStages[active];
  const total = traceStages[traceStages.length - 1].end;
  return (
    <figure className="product-trace">
      <figcaption>
        <span>
          <ProductIcon name="Radio" size={17} /> Example trace
        </span>
        <span className="product-traceStatus">
          <CircleCheck size={15} aria-hidden="true" /> Settled
        </span>
      </figcaption>
      <dl className="product-traceMetrics">
        <div>
          <dt>First token</dt>
          <dd>780 ms</dd>
        </div>
        <div>
          <dt>Gateway time</dt>
          <dd>1.2 s</dd>
        </div>
      </dl>
      <ol className="product-waterfall">
        {traceStages.map(({ name, start, end, icon }, index) => (
          <li key={name}>
            <button type="button" aria-pressed={active === index} onClick={() => setActive(index)}>
              <span className="product-traceLabel">
                <ProductIcon name={icon} size={16} /> {name}
              </span>
              <span className="product-traceTrack" aria-hidden="true">
                <span
                  style={{
                    insetInlineStart: (start / total) * 100 + "%",
                    width: ((end - start) / total) * 100 + "%",
                  }}
                />
              </span>
              <span className="product-traceDuration">{end - start} ms</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="product-traceDetail" aria-live="polite">
        <div>
          <strong>{selected.name}</strong>{" "}
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
      <ProductSection id="traces" title="Follow the whole request.">
        <p>
          See where a request spent time, from reserving credits and executing the request to evidence
          verification and settlement. A pending billing hold stays visible while it is investigated.
        </p>
        <TracePreview />
        <p>
          Trace data contains timing, route, and billing metadata. Prompts and responses stay out of
          UsageMax receipts. Workspace users can see their own tokens and charges in Usage. Gateway
          traces and compute costs are restricted to authorized operators.
        </p>
      </ProductSection>
      <ProductSection id="analytics" title="Compare models and days.">
        <p>
          Group the private report by model or UTC day. Compare attempts, errors, input and output
          tokens, p50, p95 and p99 latency, first-token time, and known compute cost. Cost coverage
          shows how many requests have evidence. Margin covers only requests with both charges and
          known costs.
        </p>
        <ProductSample label="Report controls">
          <SampleFacts
            rows={[
              ["Group by", "Model · UTC day"],
              ["Window", "Up to 30 days"],
              ["Coverage", "Up to 2,000 receipts"],
            ]}
          />
        </ProductSample>
        <NextLink href="/docs/observability#export-to-usagemax">Export your workspace usage</NextLink>
      </ProductSection>
      <ProductSection id="reconciliation" title="Reconcile a statement.">
        <p>
          Operators preview finalized invoice lines against Sonnely’s billing references. Matches,
          cost variances, duplicate references, and unmatched lines have separate outcomes. Recording
          the statement publishes eligible invoice-confirmed cost revisions to UsageMax and keeps an
          audit history in Sonnely.
        </p>
        <ProductSample label="Normalized invoice line · example">
          <pre>
            <code>{"reference,cost_usd\nprovider-request-id,0.000042"}</code>
          </pre>
        </ProductSample>
        <p>Customer charges, credit balances, and treasury payout amounts follow the Sonnely ledger.</p>
      </ProductSection>
      <ProductSection id="alerts" title="Surface problems early.">
        <p>
          Scheduled alerts flag request errors, high latency, and pending billing recovery. Admin
          shows open and resolved incidents alongside the current state of receipt delivery.
        </p>
        <ProductSample label="Alert thresholds">
          <SampleFacts
            rows={[
              ["Evaluation interval", "5 minutes"],
              ["Error rate", "20%"],
              ["p95 latency", "5 seconds"],
            ]}
          />
          <p className={caption}>Alerts use at least five attempts in the previous hour.</p>
        </ProductSample>
      </ProductSection>
      <ProductSection id="evaluations" title="Evaluate before you roll out.">
        <p>
          UsageMax includes a versioned gateway eval runner. Use synthetic fixtures for CI regression
          checks, or run explicit live measurements against Sonnely with a request budget and a
          reviewed baseline. Results include pass status, token counts, charge, and latency.
        </p>
        <NextLink href="/blog/choose-a-model">Plan a small evaluation</NextLink>
      </ProductSection>
    </>
  );
}

function Inference() {
  return (
    <>
      <ProductSection id="routing" title="Sonnely picks the route.">
        <p>
          Every request runs on confidential compute selected by the gateway. Choose a model ID from
          the catalog; Sonnely routes it to an available attested execution environment and meters the
          tokens it reports back.
        </p>
        <ProductSample label="What a request needs">
          <SampleFacts
            rows={[
              ["Model", "Catalog ID"],
              ["Route", "Automatic confidential"],
              ["Budget", "Optional per-request cap"],
            ]}
          />
        </ProductSample>
        <NextLink href="/models#available-models">Compare models and prices</NextLink>
      </ProductSection>
      <ProductSection id="streaming" title="Stream with a budget.">
        <p>
          Send an OpenAI-compatible Chat Completions request with streaming enabled. Ask for final
          usage when consuming the stream. Set a cap for one request with{" "}
          <code>max_cost_microusd</code>, alongside daily and lifetime limits on the API key.
        </p>
        <ProductSample label="Streaming request options">
          <pre>
            <code>
              {JSON.stringify(
                {
                  stream: true,
                  stream_options: { include_usage: true },
                  max_cost_microusd: 500,
                },
                null,
                2,
              )}
            </code>
          </pre>
        </ProductSample>
        <NextLink href="/docs/streaming">Read the streaming guide</NextLink>
      </ProductSection>
      <ProductSection id="evidence" title="Know the privacy boundary.">
        <p>
          A trusted execution environment protects the model while it runs. Sonnely’s HTTPS gateway
          can read the request while forwarding it. Each route supplies its own evidence, so verify
          the claim in the optional Sonnely receipt before relying on a specific attestation
          guarantee.
        </p>
        <ProductSample label="What each layer handles">
          <SampleFacts
            rows={[
              ["Sonnely gateway", "Validation, forwarding, settlement"],
              ["Confidential TEE", "Model execution"],
              ["Receipt", "Route evidence"],
            ]}
          />
        </ProductSample>
        <NextLink href="/docs/attestation">Review attestation evidence</NextLink>
      </ProductSection>
    </>
  );
}

const computeProductIds = ["blackboxes", "dry-docks"] as const;

function Compute() {
  return (
    <ProductSection id="products" title="Compute products">
      <div className="product-computeList">
        {computeProductIds.map((id) => {
          const Icon = id === "blackboxes" ? Fingerprint : Terminal;
          const title = computePlans[id].title;
          const detail =
            id === "blackboxes"
              ? "Attested confidential VMs"
              : "Isolated public-repository builds on Boat";
          return (
            <a id={id} key={id} href={"/" + id}>
              <Icon aria-hidden="true" size={20} />
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          );
        })}
      </div>
      <NextLink href="/models#billing">See compute pricing</NextLink>
    </ProductSection>
  );
}

function Blackboxes() {
  const plan = computePlans.blackboxes;
  return (
    <>
      <ProductSection id="rental" title="Rent an attested VM.">
        <p>
          Blackboxes are paid, time-limited confidential VMs. Start from an NGINX, HTTP playground,
          or request inspector preset, or bring a public image pinned by digest. Choose your TDX
          machine, temporary SSD size, and rental term before reviewing the credit hold.
        </p>
        <ProductSample label="Blackbox pilot configuration">
          <SampleFacts
            rows={[
              ["Starting configuration", plan.size],
              ["Rental terms", plan.minutes.join(", ") + " minutes"],
              ["15-minute estimate", creditBalance(computeQuote("blackboxes", 15).total)],
            ]}
          />
        </ProductSample>
        <p>
          Quotes include metered compute cost, a {computeMarkup}% service markup, and a fixed fee for
          a billable run. Pilot availability depends on your account and capacity.
        </p>
      </ProductSection>
      <ProductSection id="attestation" title="Inspect the evidence.">
        <p>
          The console displays available workload attestation metadata and lifecycle status. Use the
          attestation to verify the workload you intended to launch. The lease expires automatically.
          Stop the VM earlier from the console if you finish before its expiry.
        </p>
        <ProductSample label="Rental lifecycle">
          <SampleFacts
            rows={[
              ["Before start", "Review the credit hold"],
              ["During the lease", "Inspect available attestation"],
              ["At the end", "Stop or allow expiry"],
            ]}
          />
        </ProductSample>
        <NextLink href="/console/blackboxes">Check pilot access</NextLink>
      </ProductSection>
    </>
  );
}

function DryDocks() {
  const plan = computePlans["dry-docks"];
  return (
    <ProductSection id="workflow" title="A clean environment for each build.">
      <p>
        Dry Docks starts from a public GitHub repository and exact commit. A disposable Boat sandbox
        runs the build with streamed logs and a downloadable output archive.
      </p>
      <ProductSample label="Planned build workflow">
        <ol className="product-buildSteps">
          <li>
            <strong>Pin the source</strong>
            <span>Repository URL and commit SHA</span>
          </li>
          <li>
            <strong>Follow the build</strong>
            <span>Live logs · {plan.size}</span>
          </li>
          <li>
            <strong>Collect artifacts</strong>
            <span>Download the archive before retention expires</span>
          </li>
          <li>
            <strong>Auto teardown</strong>
            <span>Each build runs within a time-limited lease</span>
          </li>
        </ol>
      </ProductSample>
      <p>Artifact downloads are limited to {artifactLimit / 1024 ** 2} MiB.</p>
      <NextLink href="/console/dry-docks">Open Dry Docks</NextLink>
    </ProductSection>
  );
}

const pageContent: Record<ProductPageId, () => ReactNode> = {
  inference: Inference,
  observability: Observability,
  compute: Compute,
  blackboxes: Blackboxes,
  "dry-docks": DryDocks,
};

const pageSections: Record<ProductPageId, readonly (readonly [string, string])[]> = {
  inference: [
    ["routing", "Routing"],
    ["streaming", "Streaming"],
    ["evidence", "Privacy boundary"],
  ],
  observability: [
    ["traces", "Traces"],
    ["analytics", "Analytics"],
    ["reconciliation", "Reconciliation"],
    ["alerts", "Alerts"],
    ["evaluations", "Evaluations"],
  ],
  compute: [],
  blackboxes: [
    ["rental", "Rental configuration"],
    ["attestation", "Attestation"],
  ],
  "dry-docks": [],
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
  compute: {
    title: "Compute products",
    rows: [
      ["Blackboxes", "Paid VM rentals"],
      ["Dry Docks", "Build sandboxes"],
    ],
  },
  blackboxes: {
    title: "Pilot configuration",
    rows: [
      ["Compute", "Confidential cloud"],
      ["Lease terms", computePlans.blackboxes.minutes.join(" · ") + " min"],
      ["15-minute estimate", creditBalance(computeQuote("blackboxes", 15).total)],
    ],
  },
  "dry-docks": {
    title: "Planned build workflow",
    rows: [
      ["Source", "Public GitHub commit"],
      ["Runtime", "Disposable Boat sandbox"],
      ["Output", "Live logs and artifacts"],
    ],
  },
};

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
        status={page === "blackboxes" ? "Paid pilot" : undefined}
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
      <div className="product-product">
        <div className={sections.length ? "product-withNavigation" : undefined}>
          {sections.length > 0 && <ReaderNavigation sections={sections} />}
          <div className="product-page">
            <Content />
          </div>
        </div>
        <PlatformLinks compact />
      </div>
    </div>
  );
}
