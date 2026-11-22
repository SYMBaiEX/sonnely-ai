import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Boxes, Cpu, Fingerprint, Terminal } from "lucide-react";
import { artifactLimit, computeMarkup, computePlans, computeQuote } from "@/lib/compute";
import { creditBalance } from "@/lib/credit-amount";
import { models } from "@/lib/models";
import { listModelRoutes, providerIds } from "@/lib/provider-catalog";
import type { ProductPage } from "@/lib/product-pages";
import styles from "./product-pages.module.css";

const products = [
  {
    href: "/inference",
    label: "Confidential inference",
    description: "Pin a provider route, stream a completion, and verify its receipt.",
    icon: Cpu,
  },
  {
    href: "/observability",
    label: "Inference observability",
    description: "Follow gateway traces, compare latency and costs, and surface operational alerts.",
    icon: Activity,
  },
  {
    href: "/compute",
    label: "Compute",
    description: "Explore attested Blackbox rentals and upcoming Dry Docks builds.",
    icon: Boxes,
  },
];

export function PlatformLinks({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={compact ? styles.related : "section " + styles.index}
      aria-labelledby="platform-links-heading"
    >
      <div className={styles.indexIntro}>
        <h2 id="platform-links-heading">
          {compact ? "Explore the platform" : "Inference, from API to operations."}
        </h2>
        {!compact && <p>Choose a model route, understand each request, and run isolated workloads.</p>}
      </div>
      <ul className={styles.linkList}>
        {products.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href}>
              <Icon size={20} aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                {!compact && <small>{description}</small>}
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className={styles.section}>
      <h2>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function NextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-link">
      {children} <ArrowRight size={15} aria-hidden="true" />
    </Link>
  );
}

function ProductSample({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className={"panel " + styles.sample}>
      <figcaption>{label}</figcaption>
      {children}
    </figure>
  );
}

const traceSample = [
  { name: "Reserve credits", start: 0, end: 8 },
  { name: "Provider attempt", start: 8, end: 78 },
  { name: "Verify evidence", start: 78, end: 94 },
  { name: "Write settlement", start: 94, end: 100 },
];

function Observability() {
  return (
    <>
      <ProductSection id="traces" title="Follow the whole request.">
        <p>
          See where a request spent time, from reserving credits and calling the provider to evidence
          verification and settlement. A pending billing hold stays visible while it is investigated.
        </p>
        <ProductSample label="Example trace · Phala">
          <dl className={styles.sampleStats}>
            <div>
              <dt>First token</dt>
              <dd>780 ms</dd>
            </div>
            <div>
              <dt>Gateway time</dt>
              <dd>1.2 s</dd>
            </div>
            <div>
              <dt>Billing</dt>
              <dd>Settled</dd>
            </div>
          </dl>
          <ol className={styles.waterfall}>
            {traceSample.map(({ name, start, end }) => (
              <li key={name}>
                <span>{name}</span>
                <div aria-hidden="true">
                  <span style={{ insetInlineStart: start + "%", width: end - start + "%" }} />
                </div>
              </li>
            ))}
          </ol>
        </ProductSample>
        <p>
          Trace data contains timing, route, and billing metadata. Prompts and responses stay out of UsageMax
          receipts. Workspace users can see their own tokens and charges in Usage. Gateway traces and provider
          costs are restricted to authorized operators.
        </p>
      </ProductSection>
      <ProductSection id="analytics" title="Compare providers and models.">
        <p>
          Group the private report by provider, model, or UTC day. Compare attempts, errors, input and output
          tokens, p50, p95 and p99 latency, first-token time, and known provider cost. Cost coverage shows how
          many requests have evidence. Margin covers only requests with both charges and known costs.
        </p>
        <p>
          Choose a reporting window of up to 30 days in Sonnely Admin. Each report analyzes up to 2,000 of the
          newest retained receipts and labels partial coverage.
        </p>
        <NextLink href="/docs#usage-export">Export your workspace usage</NextLink>
      </ProductSection>
      <ProductSection id="reconciliation" title="Reconcile a provider statement.">
        <p>
          Operators preview finalized invoice lines against Sonnely’s provider billing references. Matches,
          cost variances, duplicate references, and unmatched lines have separate outcomes. Recording the
          statement publishes eligible invoice-confirmed cost revisions to UsageMax and keeps an audit history
          in Sonnely.
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
          Scheduled alerts flag provider attempt errors, high latency, and pending billing recovery. Admin
          shows open and resolved incidents alongside the current state of receipt delivery.
        </p>
        <p>
          UsageMax evaluates conditions every five minutes. Provider alerts use at least five attempts in the
          previous hour, with thresholds of 20% errors and 5 seconds p95 latency.
        </p>
      </ProductSection>
      <ProductSection id="evaluations" title="Evaluate before you roll out.">
        <p>
          UsageMax includes a versioned gateway eval runner. Use synthetic fixtures for CI regression checks,
          or run explicit live measurements against Sonnely with a request budget and a reviewed baseline.
          Results include pass status, token counts, charge, and latency.
        </p>
        <NextLink href="/blog/choose-a-model">Plan a small evaluation</NextLink>
      </ProductSection>
    </>
  );
}

function Inference() {
  const routes = listModelRoutes(models[0], providerIds);
  return (
    <>
      <ProductSection id="routing" title="Choose the route.">
        <p>
          DeepSeek V4.1 Flash is available through NEAR AI, Phala, and Tinfoil. Additional live text models
          use supported NEAR AI Private TEE routes. Query the model API for current availability and exact
          per-route pricing.
        </p>
        <ProductSample label="Route example · DeepSeek V4.1 Flash">
          <ul className={styles.routeList}>
            {routes.map(({ provider, provider_name }) => (
              <li key={provider}>
                <strong>{provider_name}</strong>
                <code>{provider}</code>
              </li>
            ))}
          </ul>
          <pre>
            <code>{'{ "provider": { "only": ["phala"] } }'}</code>
          </pre>
        </ProductSample>
        <NextLink href="/models#available-models">Compare models and prices</NextLink>
      </ProductSection>
      <ProductSection id="streaming" title="Stream with a budget.">
        <p>
          Send an OpenAI-compatible Chat Completions request with streaming enabled. Ask for final usage when
          consuming the stream. Set a cap for one request with <code>max_cost_microusd</code>, alongside daily
          and lifetime limits on the API key.
        </p>
        <NextLink href="/docs#streaming">Read the streaming guide</NextLink>
      </ProductSection>
      <ProductSection id="evidence" title="Know the privacy boundary.">
        <p>
          The provider’s trusted execution environment protects inference at the provider. Sonnely’s HTTPS
          gateway can read the request while forwarding it. Each route supplies its own evidence, so verify
          the provider and claim in the optional Sonnely receipt before relying on a specific attestation
          guarantee.
        </p>
        <NextLink href="/docs#verification">Review evidence by provider</NextLink>
      </ProductSection>
    </>
  );
}

function Compute() {
  return (
    <ProductSection id="products" title="Choose a compute product.">
      <div className={styles.computeList}>
        <Link href="/blackboxes">
          <Fingerprint aria-hidden="true" size={20} />
          <span>
            <strong>Blackboxes</strong>
            <small>Paid pilot · Attested confidential VMs on Phala Cloud</small>
          </span>
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
        <Link href="/dry-docks">
          <Terminal aria-hidden="true" size={20} />
          <span>
            <strong>Dry Docks</strong>
            <small>Coming soon · Isolated public-repository builds on Boat</small>
          </span>
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </div>
      <p>
        Compute has separate rates from inference. You can review the quote and reserve credits before an
        available rental starts. The console tracks each run’s status and settlement.
      </p>
      <NextLink href="/pricing#compute-pricing">See compute pricing</NextLink>
    </ProductSection>
  );
}

function Blackboxes() {
  const plan = computePlans.blackboxes;
  return (
    <>
      <ProductSection id="rental" title="Rent an attested VM.">
        <p>
          Blackboxes are paid, time-limited CVMs running on Phala Cloud. Start with a public Docker Hub or
          GHCR image pinned by digest, choose an application port and rental term, then review the reservation
          in the console.
        </p>
        <ProductSample label="Blackbox pilot configuration">
          <dl className={styles.sampleStats}>
            <div>
              <dt>Resources</dt>
              <dd>{plan.size}</dd>
            </div>
            <div>
              <dt>Rental terms</dt>
              <dd>{plan.minutes.join(", ")} minutes</dd>
            </div>
            <div>
              <dt>15-minute estimate</dt>
              <dd>{creditBalance(computeQuote("blackboxes", 15).total)}</dd>
            </div>
          </dl>
        </ProductSample>
        <p>
          Quotes include metered provider cost, a {computeMarkup}% service markup, and a fixed fee for a
          billable run. Pilot availability depends on your account and provider capacity.
        </p>
      </ProductSection>
      <ProductSection id="attestation" title="Inspect the evidence.">
        <p>
          The console displays available workload attestation metadata and lifecycle status. Use the
          attestation to verify the workload you intended to launch. The lease expires automatically. Stop the
          VM earlier from the console if you finish before its expiry.
        </p>
        <NextLink href="/console/blackboxes">Check pilot access</NextLink>
      </ProductSection>
    </>
  );
}

function DryDocks() {
  const plan = computePlans["dry-docks"];
  return (
    <>
      <ProductSection id="workflow" title="A clean environment for each build.">
        <p>
          Dry Docks is coming soon. The planned workflow starts from a public GitHub repository and exact
          commit. A disposable Boat sandbox runs the build with streamed logs and a downloadable output
          archive.
        </p>
        <ProductSample label="Planned build workflow">
          <ol className={styles.buildSteps}>
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
        <p>
          Planned artifact downloads are limited to {artifactLimit / 1024 ** 2} MiB. Build submissions are
          paused during rollout.
        </p>
        <NextLink href="/contact">Ask about build sandbox access</NextLink>
      </ProductSection>
    </>
  );
}

const pageContent = {
  inference: Inference,
  observability: Observability,
  compute: Compute,
  blackboxes: Blackboxes,
  "dry-docks": DryDocks,
};

export function ProductContent({ page }: { page: ProductPage }) {
  const Content = pageContent[page];
  return (
    <div className={styles.page}>
      {page === "observability" && (
        <nav className={styles.jump} aria-label="Observability sections">
          <a href="#traces">Traces</a>
          <a href="#analytics">Analytics</a>
          <a href="#reconciliation">Reconciliation</a>
          <a href="#alerts">Alerts</a>
          <a href="#evaluations">Evaluations</a>
        </nav>
      )}
      <Content />
      <PlatformLinks compact />
    </div>
  );
}
