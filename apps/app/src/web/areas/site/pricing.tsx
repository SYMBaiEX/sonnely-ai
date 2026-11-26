// spec/app/models.md, "Story: Filter the catalog"
/* eslint-disable better-tailwindcss/no-unknown-classes -- pricing uses the ported site design system class names */
import { ArrowDown, ArrowRight, ArrowUpRight, Calculator, Fingerprint, KeyRound, Wallet } from "lucide-react";
import { useState } from "react";
import { Input } from "@repo/ui";
import { creditBalance, formatRate, limits, requestCharge, routeRates } from "./data.ts";
import { canonicalGroups, chatModels, chatModelRoute } from "./catalog-data.ts";
import { CatalogCards } from "./catalog-cards.tsx";
import { SiteLead } from "./chrome.tsx";
import { PlatformLinks } from "./products.tsx";
import { buttonAccent, sectionHead, selectClass, serif, textLink, wrap } from "./ui.ts";

const tokenPriced = (group: (typeof canonicalGroups)[number]) =>
  group.entries.some((entry) =>
    entry.routes.some((route) =>
      route.rates.some((rate) => rate.kind === "input" || rate.kind === "output"),
    ),
  );

const pricedGroups = canonicalGroups
  .filter((group) => !group.catalogOnly)
  .sort((a, b) => Number(!tokenPriced(a)) - Number(!tokenPriced(b)));

function tokens(value: string, maximum: number) {
  const count = Number(value);
  return value !== "" && Number.isSafeInteger(count) && count >= 0 && count <= maximum
    ? count
    : null;
}

function CostExample() {
  const [modelId, setModelId] = useState(() => chatModelRoute(chatModels[0])?.modelId ?? "");
  const [input, setInput] = useState("10000");
  const [output, setOutput] = useState("1000");
  const entry =
    chatModels.find((model) => chatModelRoute(model)?.modelId === modelId) ?? chatModels[0];
  const rates = entry ? routeRates(chatModelRoute(entry)!) : {};
  const inputTokens = tokens(input, limits.bodyBytes);
  const outputTokens = tokens(output, limits.maxOutputTokens);
  const estimate =
    inputTokens === null || outputTokens === null
      ? null
      : requestCharge(rates, inputTokens, 0, outputTokens);

  return (
    <section className="estimate" id="estimate" aria-labelledby="pricing-estimate-title">
      <header>
        <span className="estimate-icon">
          <Calculator size={21} aria-hidden="true" />
        </span>
        <div>
          <h2 id="pricing-estimate-title">Estimate a request</h2>
          <p>Compare uncached text requests at Sonnely’s final token rates.</p>
        </div>
      </header>
      <div className="estimate-inputs">
        <label>
          <span>Model</span>
          <select className={selectClass} value={modelId} onChange={(event) => setModelId(event.target.value)}>
            {chatModels.map((model) => {
              const route = chatModelRoute(model)!;
              return (
                <option key={model.provider + route.modelId} value={route.modelId}>
                  {model.name}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          <span>Input tokens</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={limits.bodyBytes}
            step={1}
            invalid={inputTokens === null}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <label>
          <span>Output tokens</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={limits.maxOutputTokens}
            step={1}
            invalid={outputTokens === null}
            value={output}
            onChange={(event) => setOutput(event.target.value)}
          />
        </label>
      </div>
      <div className="estimate-summary">
        <p>Estimated charge</p>
        <output aria-live="polite">
          {estimate === null ? "Check token counts" : creditBalance(estimate)}
        </output>
        <dl aria-label="Rates per million tokens">
          <div>
            <dt>Input / 1M tokens</dt>
            <dd>{formatRate(rates.Input ?? 0)}</dd>
          </div>
          {rates.Cached !== undefined && rates.Cached >= 0 && (
            <div>
              <dt>Cached input / 1M tokens</dt>
              <dd>{formatRate(rates.Cached)}</dd>
            </div>
          )}
          <div>
            <dt>Output / 1M tokens</dt>
            <dd>{formatRate(rates.Output ?? 0)}</dd>
          </div>
        </dl>
      </div>
      <footer>
        <span>Actual charges use reported usage and account for cached input.</span>
        <a href="#inference-rates">
          Compare inference rates <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </section>
  );
}

function PricingEssentials() {
  return (
    <section className="pricing-essentials" aria-labelledby="pricing-essentials-title">
      <header className={sectionHead}>
        <div>
          <h2 id="pricing-essentials-title" style={serif}>Pricing essentials</h2>
          <p>Prepaid credits, final rates, and controls before traffic starts.</p>
        </div>
      </header>
      <div className="price-cards grid min-[900px]:grid-cols-3">
        <article className="benefit">
          <Wallet aria-hidden="true" />
          <h3>Prepaid credits</h3>
          <p>
            Choose a credit amount and pay with USDC or SOL. Credits post automatically when the Solana transfer finalizes.
          </p>
          <a className={textLink} href="/console/billing">
            Billing console <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </article>
        <article className="benefit">
          <Fingerprint aria-hidden="true" />
          <h3>Final rates</h3>
          <p>
            Token endpoints are priced per million tokens. File, media, and realtime endpoints use the listed request or session rate.
          </p>
          <a className={textLink} href="#inference-rates">
            Inference rates <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </article>
        <article className="benefit">
          <KeyRound aria-hidden="true" />
          <h3>Key budgets</h3>
          <p>
            Set daily and lifetime spend limits, choose an expiration, and revoke a key immediately.
          </p>
          <a className={textLink} href="/console/keys">
            Manage keys <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </article>
      </div>
    </section>
  );
}

function InferenceRates() {
  return (
    <section id="inference-rates" aria-labelledby="inference-rates-title">
      <header className={sectionHead}>
        <div>
          <h2 id="inference-rates-title" style={serif}>Inference rates</h2>
          <p>
            Every rate comes from the same catalog the gateway uses. Open a model to compare provider routes and endpoint-specific fees.
          </p>
        </div>
        <a className={textLink} href="/models">
          Model catalog <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <CatalogCards groups={pricedGroups} filterSignature="pricing" />
    </section>
  );
}

function PricingQuestions() {
  return (
    <section className="pricing-questions" aria-labelledby="pricing-questions-title">
      <header>
        <h2 id="pricing-questions-title" style={serif}>Pricing questions</h2>
        <a href="/docs/billing">
          Credits and checkout <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <div className="faq">
        <details name="pricing-questions">
          <summary>What do I need to buy credits?</summary>
          <p>
            Use a compatible Solana wallet with enough SOL for network fees. Sign in with the wallet that will pay, then choose SOL or USDC in Billing.
          </p>
        </details>
        <details name="pricing-questions">
          <summary>How does a request settle?</summary>
          <p>
            Sonnely reserves the estimated maximum before sending a request, records the final usage charge, and releases the unused hold. Unreported usage can leave a reservation pending reconciliation.
          </p>
        </details>
        <details name="pricing-questions">
          <summary>What token categories are billed?</summary>
          <p>
            Reported input, cached input, and output token counts determine the final token charge up to the reservation. Cached input uses the route’s cached rate when one is published.
          </p>
        </details>
        <details name="pricing-questions">
          <summary>Where can I see what a request cost?</summary>
          <p>
            Open Usage in the console to review token counts, request status, and charges. Billing lists payment receipts separately.
          </p>
        </details>
        <details name="pricing-questions">
          <summary>Do devnet payments create credits?</summary>
          <p>
            Devnet payments verify the checkout path. Spendable credits require a verified mainnet payment.
          </p>
        </details>
      </div>
    </section>
  );
}

export function PricingPage() {
  return (
    <div className={wrap + " inner-page market-page"}>
      <div className="page-pricing">
        <SiteLead
          title="Pricing"
          description="Prepaid Solana credits, final inference rates, and request charges that settle against real usage."
          brief={{
            title: "Pricing at a glance",
            rows: [
              ["Routable models", String(pricedGroups.length)],
              ["Token rates", "Per 1M tokens"],
              ["Billing", "USDC or SOL"],
              ["Settlement", "Reported usage"],
            ],
          }}
        >
          <div className="mt-5.5 flex flex-wrap items-center gap-4">
            <a href="#estimate" className={buttonAccent}>
              Estimate a request <ArrowDown size={15} aria-hidden="true" />
            </a>
            <a href="#inference-rates" className={textLink}>
              Browse rates <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </SiteLead>
        <PricingEssentials />
        <CostExample />
        <InferenceRates />
        <PricingQuestions />
        <PlatformLinks compact />
      </div>
    </div>
  );
}
