// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@repo/ui";
import { creditBalance, formatRate, limits, requestCharge, routeRates } from "./data.ts";
import { canonicalGroups, chatModels, chatModelRoute, liveStatuses, useLiveAvailability } from "./catalog-data.ts";
import { CatalogCards } from "./catalog-cards.tsx";
import { sectionHead, textLink } from "./ui.ts";
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
  const fields = [
    { id: "pricing-input-tokens", label: "Input tokens", value: input, setValue: setInput, max: limits.bodyBytes, invalid: inputTokens === null },
    { id: "pricing-output-tokens", label: "Output tokens", value: output, setValue: setOutput, max: limits.maxOutputTokens, invalid: outputTokens === null },
  ];

  return (
    <section className="pricing-estimate" id="estimate" aria-labelledby="pricing-estimate-title" tabIndex={-1}>
      <div className="pricing-estimate-section">
        <h2 id="pricing-estimate-title">Request estimator</h2>
        <p>One text request, without cached input.</p>
        <div className="pricing-estimate-inputs">
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
          {fields.map(({ id, label, value, setValue, max, invalid }) => (
            <div key={id}>
              <label htmlFor={id}>{label}</label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                step={1}
                invalid={invalid}
                aria-describedby={invalid ? `${id}-error` : undefined}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              {invalid && <p id={`${id}-error`}>Enter a whole number from 0 to {max.toLocaleString("en-US")}.</p>}
            </div>
          ))}
        </div>
      </div>
      <figure className="pricing-invoice">
        <figcaption>Estimated charge</figcaption>
        <output data-invalid={estimate === null}>
          {estimate === null ? "Fix the token counts to see an estimate." : creditBalance(estimate)}
        </output>
        <dl aria-label="Rates per million tokens">
          <div>
            <dt>Input / 1M</dt>
            <dd>{formatRate(rates.Input ?? 0)}</dd>
          </div>
          {rates.Cached !== undefined && rates.Cached >= 0 && (
            <div>
              <dt>Cached input / 1M</dt>
              <dd>{formatRate(rates.Cached)}</dd>
            </div>
          )}
          <div>
            <dt>Output / 1M</dt>
            <dd>{formatRate(rates.Output ?? 0)}</dd>
          </div>
        </dl>
        <p>Final charges use reported token counts, including cached input.</p>
        <a href="#inference-rates" className={textLink}>
          Compare provider rates <ArrowDown size={14} aria-hidden="true" />
        </a>
      </figure>
    </section>
  );
}

function PricingEssentials() {
  const terms = [
    {
      title: "Fund credits",
      copy: "When checkout is available, pay with USDC or SOL. Credits appear after the Solana transfer finalizes.",
      href: "/console/billing",
      link: "Open billing",
    },
    {
      title: "Check endpoint rates",
      copy: "Token endpoints bill per million tokens. Other endpoints use the unit listed for that route.",
      href: "#inference-rates",
      link: "Compare rates",
    },
    {
      title: "Limit key spend",
      copy: "Set daily and lifetime spend limits, choose an expiration and revoke a key immediately.",
      href: "/console/keys",
      link: "Manage keys",
    },
  ] as const;
  return (
    <section className="section pricing-terms" aria-labelledby="pricing-essentials-title">
      <h2 id="pricing-essentials-title">How billing works</h2>
      <ul className="pricing-terms-grid" role="list">
        {terms.map(({ title, copy, href, link }) => (
          <li key={title}>
            <h3>{title}</h3>
            <p>{copy}</p>
            <a href={href} className={textLink}>
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
    <section className="section pricing-rates" id="inference-rates" aria-labelledby="inference-rates-title" tabIndex={-1}>
      <div className={sectionHead}>
        <div>
          <h2 id="inference-rates-title">Model rates</h2>
          <p>
            Compare rates for {pricedGroups.length} routable models. Token rates are per million tokens;
            expand a model to see provider-specific and per-request fees.
          </p>
        </div>
        <a href="/models" className={textLink}>
          Model catalog <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <CatalogCards groups={pricedGroups} filterSignature="pricing" statuses={liveStatuses(live)} />
    </section>
  );
}

function PricingQuestions() {
  const questions = [
    ["What do I need to buy credits?", "Use a compatible Solana wallet with enough SOL for network fees. Sign in with the wallet that will pay, then choose SOL or USDC in Billing."],
    ["When is a request charged?", "Sonnely sets aside the estimated maximum before sending the request. Once usage is reported, it charges for that usage and releases the rest. If usage isn't reported, the hold may stay in place until it can be reconciled."],
    ["Which tokens count toward the charge?", "Sonnely bills reported input, cached input, and output tokens, up to the amount set aside for the request. Cached input uses the route’s cached rate when one is published."],
    ["Where can I see what a request cost?", "Open Usage in the console to review token counts, request status, and charges. Billing lists payment receipts separately."],
    ["Can I spend credits from devnet payments?", "No. Devnet payments test checkout. Spendable credits require a verified mainnet payment."],
  ] as const;
  return (
    <section className="section home-split home-faq pricing-faq" aria-labelledby="pricing-questions-title">
      <div className="home-section-intro">
        <h2 id="pricing-questions-title">Billing questions</h2>
        <a className={textLink} href="/docs/billing">
          Read the billing guide <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="faq">
        {questions.map(([question, answer]) => (
          <details name="pricing-questions" key={question}>
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
      <div className="pricing-hero">
        <header>
          <h1>Pay for <span>what you use.</span></h1>
          <p className="pricing-hero-description">
            Fund credits in USDC or SOL. Each request is charged from your balance based on reported usage.
          </p>
          <div className="actions">
            <a href="#estimate" className={textLink}>
              Estimate a request <ArrowDown size={15} aria-hidden="true" />
            </a>
            <a href="#inference-rates" className={textLink}>
              Browse model rates <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
        </header>
        <CostExample />
      </div>
      <InferenceRates />
      <PricingEssentials />
      <PricingQuestions />
    </div>
  );
}
