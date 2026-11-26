// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowRight, ArrowUpRight, Calculator, Fingerprint, KeyRound, Wallet } from "lucide-react";
import { useState } from "react";
import { Input } from "@repo/ui";
import { creditBalance, formatRate, limits, requestCharge, routeRates } from "./data.ts";
import { canonicalGroups, chatModels, chatModelRoute, liveStatuses, useLiveAvailability } from "./catalog-data.ts";
import { CatalogCards } from "./catalog-cards.tsx";

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
    <section className="cor-sheet cor-estimate" id="estimate" aria-labelledby="pricing-estimate-title">
      <header className="cor-sheet-head">
        <div>
          <span>Estimate slip</span>
          <h2 id="pricing-estimate-title">Estimate a request</h2>
        </div>
        <span className="cor-stamp" aria-hidden="true"><Calculator size={20} /></span>
      </header>
      <div className="cor-estimate-grid">
        <div className="cor-estimate-inputs">
          <label>
            <span>Model</span>
            <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
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
        <div className="cor-invoice" aria-label="Estimated charge">
          <span>Estimated charge</span>
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
          <p>Actual charges use reported usage and account for cached input.</p>
        </div>
      </div>
      <footer>
        <span>Uncached text request · final token rates</span>
        <a href="#inference-rates">
          Compare the full rate card <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </section>
  );
}

function PricingEssentials() {
  const terms = [
    {
      title: "Prepaid credits",
      Icon: Wallet,
      copy: "Choose a credit amount and pay with USDC or SOL. Credits post automatically when the Solana transfer finalizes.",
      href: "/console/billing",
      link: "Billing console",
    },
    {
      title: "Final rates",
      Icon: Fingerprint,
      copy: "Token endpoints are priced per million tokens. File and media endpoints use the listed per-request rate.",
      href: "#inference-rates",
      link: "Inference rates",
    },
    {
      title: "Key budgets",
      Icon: KeyRound,
      copy: "Set daily and lifetime spend limits, choose an expiration and revoke a key immediately.",
      href: "/console/keys",
      link: "Manage keys",
    },
  ] as const;
  return (
    <section className="cor-terms" aria-labelledby="pricing-essentials-title">
      <header>
        <span>Terms of account</span>
        <h2 id="pricing-essentials-title">Before traffic starts</h2>
      </header>
      <div>
        {terms.map(({ title, Icon, copy, href, link }) => (
          <article key={title}>
            <Icon size={19} aria-hidden="true" />
            <h3>{title}</h3>
            <p>{copy}</p>
            <a href={href}>{link} <ArrowUpRight size={14} aria-hidden="true" /></a>
          </article>
        ))}
      </div>
    </section>
  );
}

function InferenceRates() {
  const live = useLiveAvailability();
  return (
    <section className="cor-rates" id="inference-rates" aria-labelledby="inference-rates-title">
      <header>
        <div>
          <span>Rate card</span>
          <h2 id="inference-rates-title">Inference rates</h2>
          <p>Every rate comes from the same catalog the gateway uses. Open a model to compare provider routes and endpoint-specific fees.</p>
        </div>
        <a href="/models">Model catalog <ArrowUpRight size={15} aria-hidden="true" /></a>
      </header>
      <div className="cor-ratecards">
        <CatalogCards groups={pricedGroups} filterSignature="pricing" statuses={liveStatuses(live)} />
      </div>
    </section>
  );
}

function PricingQuestions() {
  const questions = [
    ["What do I need to buy credits?", "Use a compatible Solana wallet with enough SOL for network fees. Sign in with the wallet that will pay, then choose SOL or USDC in Billing."],
    ["How does a request settle?", "Sonnely reserves the estimated maximum before sending a request, records the final usage charge, and releases the unused hold. Unreported usage can leave a reservation pending reconciliation."],
    ["What token categories are billed?", "Reported input, cached input, and output token counts determine the final token charge up to the reservation. Cached input uses the route’s cached rate when one is published."],
    ["Where can I see what a request cost?", "Open Usage in the console to review token counts, request status, and charges. Billing lists payment receipts separately."],
    ["Do devnet payments create credits?", "Devnet payments verify the checkout path. Spendable credits require a verified mainnet payment."],
  ] as const;
  return (
    <section className="cor-questions" aria-labelledby="pricing-questions-title">
      <header>
        <span>Notes on settlement</span>
        <h2 id="pricing-questions-title">Pricing questions</h2>
        <a href="/docs/billing">Credits and checkout <ArrowUpRight size={15} aria-hidden="true" /></a>
      </header>
      <div>
        {questions.map(([question, answer]) => (
          <details name="pricing-questions" key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PricingPage() {
  return (
    <div className="wrap cor-page cor-pricing-page">
      <header className="cor-pricing-hero">
        <div>
          <span>Rate card · Sonnely</span>
          <h1>Clear rates, set down in writing.</h1>
          <p>Prepaid Solana credits, final inference rates and request charges that settle against real usage.</p>
          <nav aria-label="Pricing actions">
            <a href="#estimate" className="cor-primary-action">Estimate a request <ArrowDown size={15} aria-hidden="true" /></a>
            <a href="#inference-rates">Browse rates <ArrowRight size={15} aria-hidden="true" /></a>
          </nav>
        </div>
        <aside aria-label="Pricing at a glance">
          <span>Account summary</span>
          <dl>
            <div><dt>Routable models</dt><dd>{pricedGroups.length}</dd></div>
            <div><dt>Token rates</dt><dd>Per 1M tokens</dd></div>
            <div><dt>Billing</dt><dd>USDC or SOL</dd></div>
            <div><dt>Settlement</dt><dd>Reported usage</dd></div>
          </dl>
        </aside>
      </header>
      <PricingEssentials />
      <CostExample />
      <InferenceRates />
      <PricingQuestions />
    </div>
  );
}
