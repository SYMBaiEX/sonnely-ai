import Link from "next/link";
import { ArrowUpRight, Braces, Code2, FileText, Fingerprint, KeyRound, ScanLine, Wallet } from "lucide-react";
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
    body: "Point a compatible Chat Completions client at the gateway and select a model by its catalog ID.",
    href: "/docs#api",
    action: "See the API",
  },
  {
    icon: KeyRound,
    title: "A budget for each key",
    body: "Give every app its own key, daily cap, lifetime budget, and expiry. Review its actual charges in Usage.",
    href: "/docs#keys",
    action: "Set up API keys",
  },
  {
    icon: Wallet,
    title: "Solana sign-in and funding",
    body: "Authorize sign-in with a wallet message. When checkout is enabled, approve a USDC top-up in your wallet.",
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
    type: "documents",
  },
  {
    icon: ScanLine,
    title: "Extract and classify",
    body: "Identify fields, label a support ticket, or turn a short response into a consistent schema.",
    model: models[1],
    type: "extract",
  },
  {
    icon: Code2,
    title: "Work through code",
    body: "Explain an unfamiliar function, summarize a small diff, or draft a test plan for review.",
    model: models[2],
    type: "code",
  },
] as const;

export function HomeCapabilities() {
  return (
    <section className="section home-capabilities" aria-labelledby="capabilities-heading">
      <header className="section-head">
        <div>
          <p className="eyebrow">The gateway</p>
          <h2 id="capabilities-heading">From request to receipt.</h2>
        </div>
        <p>Choose a model, connect your client, and track usage in the same workspace.</p>
      </header>
      <ul className="capability-list" role="list">
        {capabilities.map(({ icon: Icon, title, body, href, action }) => (
          <li key={title}>
            <Icon size={20} aria-hidden="true" />
            <h3>{title}</h3>
            <p>{body}</p>
            <Link className="text-link" href={href}>
              {action} <ArrowUpRight size={15} />
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
        <div>
          <p className="eyebrow">What to run</p>
          <h2 id="workloads-heading">Start with a real task.</h2>
        </div>
        <Link className="text-link" href="/models">
          Compare models <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="home-workload-grid">
        {workloads.map(({ icon: Icon, title, body, model, type }) => (
          <article className="panel workload-card" key={title}>
            <div className={"workload-art work-" + type} aria-hidden="true">
              {type === "documents" && (
                <>
                  <div className="workload-paper">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="workload-paper">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </>
              )}
              {type === "extract" && (
                <div className="workload-extract">
                  {Array.from({ length: 12 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
              )}
              {type === "code" && (
                <div className="workload-code">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              )}
              <Icon size={25} />
            </div>
            <div className="workload-copy">
              <h3>{title}</h3>
              <p>{body}</p>
              <Link
                className="text-link workload-model"
                href={"/console?model=" + encodeURIComponent(model.id)}
              >
                Try {model.name} <ArrowUpRight size={14} />
              </Link>
            </div>
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
          <div>
            <p className="eyebrow">Field notes</p>
            <h2 id="guides-heading">Practical guides.</h2>
          </div>
          <Link className="text-link" href="/blog">
            Read the journal <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="home-workload-grid">
          {featured.map((slug) => {
            const article = articles.find((item) => item.slug === slug)!;
            return (
              <Link href={"/blog/" + slug} className="panel benefit resource-card" key={slug}>
                <p className="eyebrow">{article.category}</p>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>
      <section className="section split home-faq" aria-labelledby="questions-heading">
        <div>
          <p className="eyebrow">Before you start</p>
          <h2 id="questions-heading">Good to know.</h2>
          <Link className="text-link" href="/contact">
            Contact Sonnely <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="faq panel">
          <details>
            <summary>What can I try without a wallet?</summary>
            <p>
              Explore the model catalog and run a local sample in the playground. Live requests require an
              eligible wallet account and available credits.
            </p>
          </details>
          <details>
            <summary>What can I send through the API?</summary>
            <p>
              Send text Chat Completions requests with up to {limits.messages} messages and request up to{" "}
              {limits.maxOutputTokens.toLocaleString("en-US")} output tokens. See{" "}
              <Link href="/docs#limits">request limits</Link> for the JSON size cap.
            </p>
          </details>
          <details>
            <summary>What does the usage ledger store?</summary>
            <p>
              It records the model, key label, token counts, request status, and charge. The gateway reads
              prompt text during forwarding. Optional chat history lives in your browser.{" "}
              <Link href="/docs#privacy">Read about data handling</Link>.
            </p>
          </details>
          <details>
            <summary>Can I use a Solana Seeker?</summary>
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
