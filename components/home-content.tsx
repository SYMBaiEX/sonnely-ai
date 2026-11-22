import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  FileText,
  Fingerprint,
  KeyRound,
  Plus,
  ScanLine,
  Server,
  Wallet,
} from "lucide-react";
import { articles } from "@/lib/journal";
import { apiBasePath, limits } from "@/lib/api-contract";
import { models } from "@/lib/models";

function RouteSample() {
  return (
    <div className="gateway-sample gateway-route">
      <p>Example provider route</p>
      <ul>
        <li data-selected="">
          <Server size={15} aria-hidden="true" /> <strong>NEAR AI</strong>
          <span>
            <Check size={13} aria-hidden="true" /> Pinned
          </span>
        </li>
        <li>
          <Server size={15} aria-hidden="true" /> Phala
        </li>
        <li>
          <Server size={15} aria-hidden="true" /> Tinfoil
        </li>
      </ul>
    </div>
  );
}

function EndpointSample() {
  return (
    <div className="gateway-sample gateway-endpoint">
      <span>POST</span>
      <code>
        {apiBasePath}/chat/
        <wbr />
        completions
      </code>
    </div>
  );
}

function BudgetSample() {
  return (
    <div className="gateway-sample gateway-budget">
      <p>Example key budget</p>
      <dl>
        <div>
          <dt>Daily limit</dt>
          <dd>$5.00</dd>
        </div>
        <div>
          <dt>Lifetime limit</dt>
          <dd>$75.00</dd>
        </div>
      </dl>
    </div>
  );
}

function FundingPath() {
  return (
    <div className="gateway-sample gateway-funding">
      <span>USDC on Solana</span>
      <ArrowRight size={16} aria-hidden="true" />
      <span>Compute credits</span>
    </div>
  );
}

const capabilities = [
  {
    id: "route",
    icon: Fingerprint,
    title: "Confidential inference",
    body: "Pick a confidential provider and check the evidence it publishes about where the model ran.",
    href: "/inference#evidence",
    action: "Verify the provider",
    Sample: RouteSample,
  },
  {
    id: "api",
    icon: Braces,
    title: "OpenAI-compatible requests",
    body: "Keep your Chat Completions client. Point it at Sonnely and choose a model ID.",
    href: "/docs/api",
    action: "See the API",
    Sample: EndpointSample,
  },
  {
    id: "budget",
    icon: KeyRound,
    title: "A budget for each key",
    body: "Set daily and lifetime limits for each key. See what each request cost in Usage.",
    href: "/docs/keys",
    action: "Set up API keys",
    Sample: BudgetSample,
  },
  {
    id: "funding",
    icon: Wallet,
    title: "Solana sign-in and funding",
    body: "Sign in with your Solana wallet. When checkout is available, top up with USDC.",
    href: "/docs/billing",
    action: "See how funding works",
    Sample: FundingPath,
  },
] as const;

const workloads = [
  {
    icon: FileText,
    title: "Make sense of messy notes",
    prompt: "What did we decide, and what’s still open?",
    model: models[0],
  },
  {
    icon: ScanLine,
    title: "Pull out the details",
    prompt: "Find the owner and due date in this handoff.",
    model: models[1],
  },
  {
    icon: Code2,
    title: "Read unfamiliar code",
    prompt: "Explain how this retry delay changes after each failure.",
    model: models[2],
  },
] as const;

export function HomeCapabilities() {
  return (
    <section className="section home-capabilities" aria-labelledby="capabilities-heading">
      <p className="eyebrow">The gateway</p>
      <header className="section-head">
        <h2 id="capabilities-heading">From request to receipt.</h2>
        <p>Pick where a request runs, set a limit, and see what you were charged.</p>
      </header>
      <ul className="gateway-grid" role="list">
        {capabilities.map(({ id, icon: Icon, title, body, href, action, Sample }) => (
          <li
            key={id}
            className={"gateway-tile gateway-tile-" + id}
            data-reveal={id === "route" ? "fade" : "rise"}
          >
            <Link href={href} aria-labelledby={"capability-" + id}>
              <div className="gateway-tile-copy">
                <span className="home-feature-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div>
                  <h3 id={"capability-" + id}>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
              <Sample />
              <span className="text-link">
                {action} <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeWorkloads() {
  return (
    <section className="section home-workloads" aria-labelledby="workloads-heading">
      <div className="section-head">
        <h2 id="workloads-heading">Start with a real task.</h2>
      </div>
      <div className="home-workload-grid">
        {workloads.map(({ icon: Icon, title, prompt, model }) => (
          <article className="workload-card" key={title} data-reveal="rise">
            <Icon size={20} aria-hidden="true" />
            <h3>{title}</h3>
            <blockquote>“{prompt}”</blockquote>
            <Link className="text-link" href={"/console?model=" + encodeURIComponent(model.id)}>
              Try {model.name} <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

const featured = ["read-a-gateway-trace", "choose-a-model", "credits-and-quotes"];

export function HomeResources() {
  return (
    <>
      <section className="section" aria-labelledby="guides-heading">
        <div className="section-head">
          <h2 id="guides-heading">Practical guides.</h2>
          <Link className="text-link" href="/blog">
            Read the journal <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="home-resources">
          {featured.map((slug) => {
            const article = articles.find((item) => item.slug === slug)!;
            return (
              <Link href={"/blog/" + slug} className="resource-row" key={slug} data-reveal="rise">
                <span>{article.category}</span>
                <div>
                  <h3>{article.title}</h3>
                  <p>{article.summary}</p>
                </div>
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>
      <section className="section home-split home-faq" aria-labelledby="questions-heading">
        <div className="home-section-intro">
          <h2 id="questions-heading">Good to know.</h2>
          <Link className="text-link" href="/contact">
            Contact Sonnely <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="faq">
          <details name="home-questions" data-reveal="fade">
            <summary>
              What can I try without a wallet? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Explore the model catalog or try a sample in the playground. To send a live request, connect an
              eligible wallet and add credits.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              What can I send through the API? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Send text Chat Completions requests with up to {limits.messages} messages and request up to{" "}
              {limits.maxOutputTokens.toLocaleString("en-US")} output tokens. See{" "}
              <Link href="/docs/api#request-limits">request limits</Link> for the JSON size cap.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              What does the usage ledger store? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              It records the model, key label, token counts, request status, and charge. The gateway reads
              prompt text during forwarding. Optional chat history lives in your browser.{" "}
              <Link href="/docs/attestation#data-handling">Read about data handling</Link>.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              Can I use a Solana Seeker? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Open Sonnely in Chrome on Seeker and choose Solana mobile wallet when connecting. At checkout,
              you can also open a Solana Pay link or scan its QR code with a compatible wallet.{" "}
              <Link href="/docs/billing">See the mobile checkout steps</Link>.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
