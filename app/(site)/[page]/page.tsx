import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Fingerprint, KeyRound, Wallet } from "lucide-react";
import { ModelGuide, CostExample } from "@/components/model-guide";
import { ModelCatalog } from "@/components/shared";
import { DeveloperGuide } from "@/components/developer-guide";
import { Contact } from "@/components/contact";
import { Scene } from "@/components/scene";
import { articles } from "@/lib/journal";

const pages = {
  models: ["Model catalog", "Compare text models by task, context window, and token pricing."],
  pricing: [
    "Pay for what you run",
    "Metered inference with a wallet-funded balance and optional per-key budgets.",
  ],
  docs: ["Developer documentation", "Connect a wallet, create a scoped key, and send your first completion."],
  blog: ["Field notes", "A closer look at the gateway, the wallet, and how they fit together."],
  contact: ["Talk to Sonnely", "Tell us what you’re building or get help with your workspace."],
} as const;
type Page = keyof typeof pages;
type Props = { params: Promise<{ page: string }> };

export function generateStaticParams() {
  return Object.keys(pages).map((page) => ({ page }));
}

export async function generateMetadata({ params }: Props) {
  const { page } = await params;
  const info = pages[page as Page];
  return info ? { title: info[0], description: info[1], alternates: { canonical: "/" + page } } : {};
}

export default async function Subpage({ params }: Props) {
  const { page } = await params;
  if (!Object.hasOwn(pages, page)) notFound();
  const [title, description] = pages[page as Page];
  return (
    <div className={"wrap inner-page page-" + page}>
      <header className="page-lead">
        <Scene />
        <Link href="/" className="eyebrow">
          Sonnely <ArrowUpRight size={13} />
        </Link>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {page === "models" && (
        <>
          <ModelCatalog />
          <ModelGuide />
        </>
      )}
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
          <CostExample />
          <section className="faq">
            <h2>Billing questions</h2>
            <details>
              <summary>How do API key budgets work?</summary>
              <p>
                Sonnely reserves a maximum estimated charge before sending each request. It releases the
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
              <summary>Where can I see what a request cost?</summary>
              <p>
                Open Usage in the console to review token counts, request status and charges. Billing lists
                payment receipts separately.
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
      {page === "docs" && <DeveloperGuide />}
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
