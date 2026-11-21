import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Code2,
  FileText,
  Fingerprint,
  KeyRound,
  Plus,
  ScanLine,
  Wallet,
} from "lucide-react";
import { articles } from "@/lib/journal";
import { limits } from "@/lib/api-contract";
import { models } from "@/lib/models";

const capabilities = [
  {
    icon: Fingerprint,
    title: "Confidential compute",
    body: "Sonnely forwards text requests to models in NEAR AI Cloud’s Private TEE tier.",
    href: "/docs#verification",
    action: "Verify the provider",
  },
  {
    icon: Braces,
    title: "OpenAI-compatible requests",
    body: "Use your existing Chat Completions client with Sonnely’s endpoint and a model ID.",
    href: "/docs#api",
    action: "See the API",
  },
  {
    icon: KeyRound,
    title: "A budget for each key",
    body: "Set daily and lifetime limits on each key. See tokens and charges in Usage.",
    href: "/docs#keys",
    action: "Set up API keys",
  },
  {
    icon: Wallet,
    title: "Solana sign-in and funding",
    body: "Sign in with your wallet and approve USDC top-ups when checkout is enabled.",
    href: "/docs#settlement",
    action: "See how funding works",
  },
] as const;

const workloads = [
  {
    icon: FileText,
    title: "Synthesize documents",
    body: "Turn a set of notes into a brief, extract decisions, or compare short excerpts.",
    model: models[0],
  },
  {
    icon: ScanLine,
    title: "Extract and classify",
    body: "Identify fields, label a support ticket, or turn a short response into a consistent schema.",
    model: models[1],
  },
  {
    icon: Code2,
    title: "Work through code",
    body: "Explain an unfamiliar function, summarize a small diff, or draft a test plan for review.",
    model: models[2],
  },
] as const;

export function HomeCapabilities() {
  return (
    <section className="section home-split home-capabilities" aria-labelledby="capabilities-heading">
      <header className="home-section-intro">
        <p className="eyebrow">The gateway</p>
        <h2 id="capabilities-heading">From request to receipt.</h2>
        <p>Run a model, set a budget, and see what each request cost.</p>
      </header>
      <ul className="capability-list" role="list">
        {capabilities.map(({ icon: Icon, title, body, href, action }) => (
          <li key={title}>
            <Link href={href}>
              <Icon size={19} aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
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
    <section className="section" aria-labelledby="workloads-heading">
      <div className="section-head">
        <h2 id="workloads-heading">Start with a real task.</h2>
      </div>
      <div className="home-workload-grid">
        {workloads.map(({ icon: Icon, title, body, model }) => (
          <article className="workload-card" key={title}>
            <Icon size={20} aria-hidden="true" />
            <h3>{title}</h3>
            <p>{body}</p>
            <Link className="text-link" href={"/console?model=" + encodeURIComponent(model.id)}>
              Try {model.name} <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

const featured = ["choose-a-model", "rotate-api-keys", "credits-and-quotes"];

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
              <Link href={"/blog/" + slug} className="resource-row" key={slug}>
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
          <details>
            <summary>
              What can I try without a wallet? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Explore the model catalog and run a local sample in the playground. Live requests require an
              eligible wallet account and available credits.
            </p>
          </details>
          <details>
            <summary>
              What can I send through the API? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Send text Chat Completions requests with up to {limits.messages} messages and request up to{" "}
              {limits.maxOutputTokens.toLocaleString("en-US")} output tokens. See{" "}
              <Link href="/docs#limits">request limits</Link> for the JSON size cap.
            </p>
          </details>
          <details>
            <summary>
              What does the usage ledger store? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              It records the model, key label, token counts, request status, and charge. The gateway reads
              prompt text during forwarding. Optional chat history lives in your browser.{" "}
              <Link href="/docs#privacy">Read about data handling</Link>.
            </p>
          </details>
          <details>
            <summary>
              Can I use a Solana Seeker? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Open Sonnely in Chrome on Seeker and choose Solana mobile wallet when connecting. At checkout,
              you can also open a Solana Pay link or scan its QR code with a compatible wallet.{" "}
              <Link href="/docs#settlement">See the mobile checkout steps</Link>.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
