import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Fingerprint, KeyRound, Wallet } from "lucide-react";
import { ModelGuide, CostExample } from "@/components/model-guide";
import { NearModelDirectory } from "@/components/near-model-directory";
import { nearCatalog } from "@/lib/near-catalog";
import { ModelCatalog } from "@/components/shared";
import { DeveloperGuide } from "@/components/developer-guide";
import { Contact } from "@/components/contact";
import { Scene } from "@/components/scene";
import { JournalIndex } from "@/components/journal-index";

const pages = {
  models: ["Model catalog", "Compare live Sonnely models and browse the NEAR AI directory by privacy tier."],
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
  const providerCatalog = page === "models" ? await nearCatalog() : null;
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
          <div className="section-head">
            <h2>Available on Sonnely</h2>
            <Link className="text-link" href="#near-directory">
              Browse the NEAR directory
            </Link>
          </div>
          <ModelCatalog />
          {providerCatalog && <NearModelDirectory {...providerCatalog} />}
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
                Choose your top-up amount in USDC after signing in and accepting the current terms. Credits
                post automatically when the Solana transfer finalizes.
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
              <p>Published token rates include a 10% Sonnely markup on provider list rates.</p>
              <Link className="text-link" href="/models">
                See rates <ArrowUpRight size={16} />
              </Link>
            </article>
          </div>
          <CostExample />
          <section className="faq">
            <h2>Billing questions</h2>
            <details>
              <summary>What do I need to buy credits?</summary>
              <p>
                Use a compatible wallet with USDC on Solana and enough SOL for network fees and token account
                setup if needed. Sign in with the wallet that will pay and approve the transfer from Billing.
              </p>
            </details>
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
      {page === "blog" && <JournalIndex />}
      {page === "contact" && <Contact />}
    </div>
  );
}
