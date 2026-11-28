// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowRight, ArrowUpRight, Calculator, Fingerprint, KeyRound, Plus, ReceiptText, Terminal, Wallet } from "lucide-react";
import { useState } from "react";
import { Input } from "@repo/ui";
import { creditBalance, formatRate, limits, requestCharge, routeRates } from "./data.ts";
import { canonicalGroups, chatModels, chatModelRoute, liveStatuses, useLiveAvailability } from "./catalog-data.ts";
import { CatalogCards } from "./catalog-cards.tsx";
import { buttonAccent, buttonQuiet, eyebrow, sectionHead, textLink } from "./ui.ts";
import "./pricing.css";

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
    <section className="section pricing-estimate-section" id="estimate" aria-labelledby="pricing-estimate-title">
      <div className={sectionHead}>
        <div>
          <h2 id="pricing-estimate-title">Estimate a request.</h2>
        </div>
        <a href="#inference-rates" className={textLink}>
          Compare the full rate card <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <div className="term pricing-estimate" data-scan data-reveal="fade">
        <div className="term-chrome">
          <span className="term-path">
            <Terminal size={13} aria-hidden="true" /> ~/pricing/estimate
            <span className="term-caret" aria-hidden="true" />
          </span>
          <span className="pricing-estimate-note">uncached text request · final token rates</span>
        </div>
        <div className="pricing-estimate-grid">
          <div className="pricing-estimate-inputs">
            <label>
              <span>model</span>
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
              <span>input tokens</span>
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
              <span>output tokens</span>
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
          <figure className="preview-data pricing-invoice" aria-label="Estimated charge">
            <figcaption>
              <Calculator size={14} aria-hidden="true" /> <strong>estimated charge</strong>
            </figcaption>
            <div className="preview-body">
              <div className="preview-hero">
                <strong>
                  <output aria-live="polite">
                    {estimate === null ? "Check token counts" : creditBalance(estimate)}
                  </output>
                </strong>
                <span>per request · {entry?.name ?? "uncached text"}</span>
              </div>
              <dl aria-label="Rates per million tokens">
                <div>
                  <dt>input / 1M tokens</dt>
                  <dd>{formatRate(rates.Input ?? 0)}</dd>
                </div>
                {rates.Cached !== undefined && rates.Cached >= 0 && (
                  <div>
                    <dt>cached input / 1M tokens</dt>
                    <dd>{formatRate(rates.Cached)}</dd>
                  </div>
                )}
                <div>
                  <dt>output / 1M tokens</dt>
                  <dd>{formatRate(rates.Output ?? 0)}</dd>
                </div>
              </dl>
              <p className="pricing-invoice-note">
                Actual charges use reported usage and account for cached input.
              </p>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

function PricingEssentials() {
  const terms = [
    {
      title: "Prepaid credits",
      Icon: Wallet,
      stage: "fund",
      copy: "When checkout is available in this deployment, choose a credit amount and pay with USDC or SOL. Credits post automatically when the Solana transfer finalizes.",
      href: "/console/billing",
      link: "Billing console",
    },
    {
      title: "Final rates",
      Icon: Fingerprint,
      stage: "rates",
      copy: "Token endpoints are priced per million tokens. File and media endpoints use the listed per-request rate.",
      href: "#inference-rates",
      link: "Inference rates",
    },
    {
      title: "Key budgets",
      Icon: KeyRound,
      stage: "limits",
      copy: "Set daily and lifetime spend limits, choose an expiration and revoke a key immediately.",
      href: "/console/keys",
      link: "Manage keys",
    },
  ] as const;
  return (
    <section className="section pricing-terms" aria-labelledby="pricing-essentials-title">
      <div className={sectionHead}>
        <div>
          <p className={eyebrow}>Terms of account</p>
          <h2 id="pricing-essentials-title">Before traffic starts.</h2>
        </div>
      </div>
      <ul className="pricing-terms-grid" role="list">
        {terms.map(({ title, Icon, stage, copy, href, link }, index) => (
          <li key={title} className="gateway-tile" data-reveal="rise">
            <div className="gateway-tile-copy">
              <span className="home-feature-icon">
                <Icon size={19} aria-hidden="true" />
              </span>
              <div>
                <p className="gateway-tile-stage" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")} · {stage}
                </p>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
            <a href={href} className="text-link">
              {link} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InferenceRates() {
  const live = useLiveAvailability();
  return (
    <section className="section pricing-rates" id="inference-rates" aria-labelledby="inference-rates-title">
      <div className={sectionHead}>
        <div>
          <h2 id="inference-rates-title">Inference rates.</h2>
          <p className="pricing-rates-copy">
            Every rate comes from the same catalog the gateway uses. Open a model to compare
            provider routes and endpoint-specific fees.
          </p>
        </div>
        <a href="/models" className={textLink}>
          Model catalog <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <div data-reveal="fade">
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
    <section className="section home-split home-faq pricing-faq" aria-labelledby="pricing-questions-title">
      <div className="home-section-intro" data-reveal="rise">
        <p className={eyebrow}>Notes on settlement</p>
        <h2 id="pricing-questions-title">Pricing questions.</h2>
        <a className={textLink} href="/docs/billing">
          Credits and checkout <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="faq">
        {questions.map(([question, answer]) => (
          <details name="pricing-questions" key={question} data-reveal="fade">
            <summary>
              {question} <Plus size={17} aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PricingPage() {
  return (
    <div className="wrap pricing-page">
      <header className="pricing-hero">
        <div className="pricing-hero-copy">
          <p className={eyebrow}>Rate card · Sonnely</p>
          <h1>
            Pay for what you use<span>.</span>
          </h1>
          <p className="pricing-hero-description">
            Prepaid Solana credits, final inference rates and request charges that settle against
            real usage.
          </p>
          <div className="actions">
            <a href="#estimate" className={buttonAccent}>
              Estimate a request <ArrowDown size={15} aria-hidden="true" />
            </a>
            <a href="#inference-rates" className={buttonQuiet}>
              Browse rates <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
        <figure className="preview-data pricing-hero-facts" aria-label="Pricing at a glance">
          <figcaption>
            <ReceiptText size={14} aria-hidden="true" /> <strong>account summary</strong>
          </figcaption>
          <div className="preview-body">
            <dl>
              <div>
                <dt>routable models</dt>
                <dd>{pricedGroups.length}</dd>
              </div>
              <div>
                <dt>token rates</dt>
                <dd>per 1M tokens</dd>
              </div>
              <div>
                <dt>billing</dt>
                <dd>USDC or SOL</dd>
              </div>
              <div>
                <dt>settlement</dt>
                <dd>reported usage</dd>
              </div>
            </dl>
          </div>
        </figure>
      </header>
      <PricingEssentials />
      <CostExample />
      <InferenceRates />
      <PricingQuestions />
    </div>
  );
}
