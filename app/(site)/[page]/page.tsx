import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Boxes, Fingerprint, KeyRound, Wallet } from "lucide-react";
import { ModelGuide } from "@/components/model-guide";
import { CostExample } from "@/components/cost-example";
import { configuredProviders, nearIntentsFundingEnabled } from "@/lib/managed-access";
import { ModelCatalog } from "@/components/model-catalog";
import { Contact } from "@/components/contact";
import { SiteLead, type SiteBrief } from "@/components/site-lead";
import { JournalIndex } from "@/components/journal-index";
import { PlatformLinks, ProductContent } from "@/components/product-pages";
import { isProductPage, productPages } from "@/lib/product-pages";
import { computeFeatures, isComputeProduct } from "@/lib/compute-features";
import { computePlans, computeQuote } from "@/lib/compute";
import { creditBalance } from "@/lib/credit-amount";
import { countRunnableModels, modelCatalogEntries } from "@/lib/model-catalog";
import { markupPercent } from "@/lib/pricing";

const pages = {
  ...productPages,
  models: ["Model catalog", "Compare the models you can run, what they cost, and the context they support."],
  pricing: [
    "Pay for what you run",
    "Fund your balance with USDC or SOL and pay for inference by the token. You can set a budget for each API key.",
  ],
  blog: [
    "Field notes",
    "Notes on how requests run, how you’re billed, and what to check when something breaks.",
  ],
  contact: ["Talk to Sonnely", "Tell us what you’re building. If you’re stuck, share what you tried."],
} as const;
type Page = keyof typeof pages;
type Props = { params: Promise<{ page: string }> };

const briefs = {
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
      ["Blackboxes", computeFeatures().blackboxes ? "Paid VM rentals" : "Coming soon"],
      ["Dry Docks", computeFeatures()["dry-docks"] ? "Build sandboxes" : "Coming soon"],
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
  models: {
    title: "Sonnely catalog",
    rows: [
      ["Available model IDs", String(countRunnableModels(configuredProviders()))],
      ["Provider entries", String(modelCatalogEntries.length)],
      ["Providers", "NEAR AI, Phala, Tinfoil"],
    ],
  },
  pricing: {
    title: "Inference billing",
    rows: [
      ["Funding", "USDC or SOL on Solana"],
      ["Meter", "Reported tokens"],
      ["Sonnely markup", markupPercent + "%"],
    ],
  },
  contact: {
    title: "Contact Sonnely",
    rows: [
      ["Workspace", "Access and API support"],
      ["Billing", "Payments and usage charges"],
      ["Partners", "Infrastructure partnerships"],
    ],
  },
} satisfies Partial<Record<Page, SiteBrief>>;

const entryActions = {
  inference: {
    section: "#routing",
    label: "Explore confidential routing",
    next: "/docs/quickstart",
    action: "Try the API quickstart",
  },
  observability: {
    section: "#traces",
    label: "Explore a sample trace",
    next: "/docs/observability",
    action: "Read the guide",
  },
  compute: {
    section: "#products",
    label: "Compare compute products",
    next: "/pricing#compute-pricing",
    action: "See compute pricing",
  },
  blackboxes: {
    section: "#rental",
    label: "Explore the rental",
    next: "/console/blackboxes",
    action: "Check pilot access",
  },
  "dry-docks": {
    section: "#workflow",
    label: "Explore the planned workflow",
    next: "/contact",
    action: "Talk to us",
  },
  models: {
    section: "#available-models",
    label: "Explore models",
    next: "/console",
    action: "Try the playground",
  },
  pricing: {
    section: "#cost-example-heading",
    label: "Estimate a request",
    next: "/console/billing",
    action: "Open billing",
  },
  blog: {
    section: "#journal-articles",
    label: "Browse articles",
    next: "/docs",
    action: "Read the docs",
  },
  contact: {
    section: "#support-form",
    label: "Open support form",
    next: "/docs/troubleshooting",
    action: "Troubleshoot the API",
  },
} as const;

export function generateStaticParams() {
  const features = computeFeatures();
  return Object.keys(pages)
    .filter((page) => !isComputeProduct(page) || features[page])
    .map((page) => ({ page }));
}

export async function generateMetadata({ params }: Props) {
  const { page } = await params;
  if (isComputeProduct(page) && !computeFeatures()[page]) return { robots: { index: false } };
  const info = pages[page as Page];
  return info ? { title: info[0], description: info[1], alternates: { canonical: "/" + page } } : {};
}

export default async function Subpage({ params }: Props) {
  const { page } = await params;
  if (!Object.hasOwn(pages, page)) notFound();
  const features = computeFeatures();
  if (isComputeProduct(page) && !features[page]) notFound();
  const [title, description] = pages[page as Page];
  const entryAction = Object.hasOwn(entryActions, page)
    ? entryActions[page as keyof typeof entryActions]
    : null;
  return (
    <div className={"wrap inner-page market-page page-" + page}>
      <SiteLead
        title={title}
        description={description}
        status={page === "blackboxes" ? "Paid pilot" : undefined}
        brief={(briefs as Partial<Record<Page, SiteBrief>>)[page as Page]}
      >
        {entryAction && (
          <div className="product-entry-actions">
            <a href={entryAction.section} className="button accent">
              {entryAction.label} <ArrowDown size={15} aria-hidden="true" />
            </a>
            <Link href={entryAction.next} className="text-link">
              {entryAction.action} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        )}
      </SiteLead>
      {isProductPage(page) && <ProductContent page={page} />}
      {page === "models" && (
        <>
          <section
            className="model-comparison"
            id="available-models"
            aria-labelledby="model-comparison-title"
          >
            <header className="section-head">
              <div>
                <h2 id="model-comparison-title">Models and rates</h2>
                <p>Compare provider routes, supported endpoints, and pricing.</p>
              </div>
            </header>
            <ModelCatalog availableProviders={configuredProviders()} />
            <Link className="text-link model-explainer" href="/inference#routing">
              How routing works <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </section>
          <ModelGuide />
        </>
      )}
      {page === "pricing" && (
        <>
          <CostExample />
          <section className="pricing-essentials" aria-labelledby="billing-basics">
            <header className="section-head">
              <h2 id="billing-basics">How billing works</h2>
            </header>
            <div className="model-cards price-cards">
              <article className="panel benefit">
                <Wallet />
                <h3>Prepaid credits</h3>
                <p>
                  After signing in and accepting the current terms, choose a credit amount and pay with USDC
                  or SOL. Credits post automatically when the Solana transfer finalizes.
                </p>
                <Link className="text-link" href="/console/billing">
                  Billing console <ArrowUpRight size={16} />
                </Link>
              </article>
              <article className="panel benefit">
                <KeyRound />
                <h3>Per-key budgets</h3>
                <p>Set limits on daily and total spend, choose an expiration, and revoke keys immediately.</p>
                <Link className="text-link" href="/console/keys">
                  Manage keys <ArrowUpRight size={16} />
                </Link>
              </article>
              <article className="panel benefit">
                <Fingerprint />
                <h3>Token rates</h3>
                <p>Published token rates include a {markupPercent}% Sonnely markup on compute costs.</p>
                <Link className="text-link" href="/models#available-models">
                  Compare token rates <ArrowUpRight size={16} />
                </Link>
              </article>
            </div>
          </section>
          <section id="compute-pricing" className="compute-pricing" aria-labelledby="compute-pricing-title">
            <header>
              <Boxes size={22} aria-hidden="true" />
              <h2 id="compute-pricing-title">Compute pricing</h2>
            </header>
            <div className="compute-pricing-options">
              {features.blackboxes ? (
                <>
                  <p>
                    A 15-minute Small Blackbox with 20 GB SSD is estimated at{" "}
                    {creditBalance(computeQuote("blackboxes", 15).total)}. Review the full reservation before
                    starting.
                  </p>
                  <Link className="text-link" href="/blackboxes#rental">
                    Explore Blackbox rentals <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <p>
                  <strong>Blackboxes</strong> <span>Coming soon</span>
                </p>
              )}
              {features["dry-docks"] ? (
                <Link className="text-link" href="/dry-docks">
                  Explore Dry Docks
                </Link>
              ) : (
                <p>
                  <strong>Dry Docks</strong> <span>Coming soon</span>
                </p>
              )}
            </div>
          </section>
          <section className="pricing-questions" aria-labelledby="billing-questions">
            <header>
              <h2 id="billing-questions">Billing questions</h2>
              <Link className="text-link" href="/docs/billing">
                Credits and checkout <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </header>
            <div className="faq">
              <details name="billing-questions">
                <summary>What do I need to buy credits?</summary>
                <p>
                  Use a compatible Solana wallet with enough SOL for network fees. Sign in with the wallet
                  that will pay, then choose SOL or USDC in Billing. A USDC payment can also require token
                  account setup.
                </p>
              </details>
              <details name="billing-questions">
                <summary>How do API key budgets work?</summary>
                <p>
                  Sonnely reserves a maximum estimated charge before sending each request. It releases the
                  difference when usage settles. Unreported usage can leave a reservation pending
                  reconciliation.
                </p>
              </details>
              {nearIntentsFundingEnabled() && (
                <details name="billing-questions">
                  <summary>Can I add funds through NEAR Intents?</summary>
                  <p>
                    Swap a supported asset into USDC in your Solana wallet, then use Buy credits in Billing.
                  </p>
                </details>
              )}
              <details name="billing-questions">
                <summary>Where can I see what a request cost?</summary>
                <p>
                  Open Usage in the console to review token counts, request status and charges. Billing lists
                  payment receipts separately.
                </p>
              </details>
              <details name="billing-questions">
                <summary>Do devnet payments create credits?</summary>
                <p>
                  Devnet payments verify the checkout path. Spendable credits require a verified mainnet
                  payment.
                </p>
              </details>
            </div>
          </section>
          <PlatformLinks compact />
        </>
      )}
      {page === "blog" && (
        <>
          <JournalIndex />
          <PlatformLinks compact />
        </>
      )}
      {page === "contact" && (
        <>
          <Contact />
          <PlatformLinks compact />
        </>
      )}
    </div>
  );
}
