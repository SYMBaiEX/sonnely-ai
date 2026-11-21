import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Fingerprint, KeyRound, Wallet } from "lucide-react";
import { CodeExample, ModelCatalog } from "@/components/shared";
import { Contact } from "@/components/contact";
import { articles } from "@/lib/journal";

const pages = {
  models: ["Model catalog", "Compare text models by task, context window, and token pricing."],
  pricing: [
    "Pay for what you run",
    "Metered inference with a wallet-funded balance and optional per-key budgets.",
  ],
  docs: ["Developer documentation", "Connect a wallet, create a scoped key, and send your first completion."],
  blog: ["Field notes", "A closer look at the gateway, the wallet, and how they fit together."],
  contact: ["Talk to Fathom Relay", "Tell us what you’re building or get help with your workspace."],
} as const;
type Page = keyof typeof pages;
type Props = { params: Promise<{ page: string }> };

export function generateStaticParams() {
  return Object.keys(pages).map((page) => ({ page }));
}

export async function generateMetadata({ params }: Props) {
  const { page } = await params;
  return { title: pages[page as Page]?.[0] };
}

export default async function Subpage({ params }: Props) {
  const { page } = await params;
  if (!Object.hasOwn(pages, page)) notFound();
  const [title, description] = pages[page as Page];
  return (
    <div className="wrap inner-page">
      <header className="page-lead">
        <Link href="/" className="eyebrow">
          Fathom Relay <ArrowUpRight size={13} />
        </Link>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {page === "models" && <ModelCatalog />}
      {page === "pricing" && (
        <>
          <div className="model-cards price-cards">
            <article className="panel benefit">
              <Wallet />
              <h2>USDC credits</h2>
              <p>
                Top up using Solana Pay when checkout is enabled. The billing console lists pending and
                finalized payments.
              </p>
              <Link className="text-link" href="/console/billing">
                Billing console <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="panel benefit">
              <KeyRound />
              <h2>Per-key budgets</h2>
              <p>Set limits on daily and total spend, choose an expiration, and revoke keys immediately.</p>
              <Link className="text-link" href="/console/keys">
                Manage keys <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="panel benefit">
              <Fingerprint />
              <h2>Token rates</h2>
              <p>Review input, cached input and output rates per million tokens in the model catalog.</p>
              <Link className="text-link" href="/models">
                See rates <ArrowUpRight size={16} />
              </Link>
            </article>
          </div>
          <section className="faq">
            <h2>Billing questions</h2>
            <details>
              <summary>How do API key budgets work?</summary>
              <p>
                Relay reserves a maximum estimated charge before sending each request. It releases the
                difference when the provider reports usage. Unreported usage can leave a reservation pending
                reconciliation.
              </p>
            </details>
            <details>
              <summary>Can I add funds through NEAR Intents?</summary>
              <p>
                The console can quote SOL to USDC through NEAR Intents. A quote is informational and does not
                move funds. Solana Pay is the direct checkout route when enabled.
              </p>
            </details>
            <details>
              <summary>Do devnet payments create credits?</summary>
              <p>
                Devnet payments verify the checkout path. Spendable credits require a verified mainnet
                payment.
              </p>
            </details>
          </section>
        </>
      )}
      {page === "docs" && (
        <div className="doc-grid">
          <nav aria-label="On this page" className="doc-nav">
            <a href="#quickstart">Quickstart</a>
            <a href="#api">API reference</a>
            <a href="#privacy">Data handling</a>
            <a href="#verification">Attestation</a>
            <a href="#settlement">Solana payments</a>
          </nav>
          <div className="doc-body">
            <section id="quickstart">
              <h2>Quickstart</h2>
              <ol>
                <li>Open the console and sign in with a Solana wallet.</li>
                <li>Create an API key and save it to a secrets manager. Relay displays the full key once.</li>
                <li>
                  Set <code>FATHOM_ORIGIN</code> to the base URL of this site and <code>FATHOM_API_KEY</code>{" "}
                  to your key. Live requests require credits and an active model provider.
                </li>
              </ol>
              <CodeExample />
            </section>
            <section id="api">
              <h2>API reference</h2>
              <p>
                <code>GET /v1/models</code> lists the available model IDs.{" "}
                <code>POST /v1/chat/completions</code> accepts non-streaming text completions with a bearer
                key.
              </p>
              <p>
                Include <code>model</code> and <code>messages</code>. Each message has a <code>role</code> of
                user, assistant, or system and a string <code>content</code>. Optional <code>max_tokens</code>{" "}
                defaults to 512 and accepts up to 2,048. The body limit is 36 KB and up to 32 messages.
              </p>
            </section>
            <section id="privacy">
              <h2>Data handling</h2>
              <p>
                HTTPS protects transit to the web gateway. The gateway can read request content and forwards
                it to NEAR AI Cloud. The account database stores wallet and usage metadata. The console stores
                chats on this device only when local history is enabled.
              </p>
            </section>
            <section id="verification">
              <h2>Attestation</h2>
              <p>
                NEAR AI publishes hardware evidence for its Private TEE model tier. You can inspect the model
                evidence using its Verification Center. The Relay gateway does not verify each response or
                provide client-to-model encryption.
              </p>
              <a className="text-link" href="https://docs.near.ai/cloud/verification">
                NEAR AI verification guide <ArrowUpRight size={16} />
              </a>
            </section>
            <section id="settlement">
              <h2>Solana payments</h2>
              <p>
                Checkout shows the network, amount, and wallet request. Submit the resulting transaction
                signature after the transfer finalizes. NEAR Intents estimates are available separately in
                Billing.
              </p>
            </section>
          </div>
        </div>
      )}
      {page === "blog" && (
        <div className="journal-grid">
          {articles.map((item) => (
            <Link key={item.slug} href={"/blog/" + item.slug} className="panel benefit journal-card">
              <BookOpen />
              <p className="eyebrow">{item.category}</p>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>
              <span className="text-link">
                Read article <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
      {page === "contact" && <Contact />}
    </div>
  );
}
