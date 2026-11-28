// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  cn,
} from "@repo/ui";
import { creditBalance, formatRate, limits, requestCharge, routeRates } from "./data.ts";
import { canonicalGroups, chatModels, chatModelRoute, liveStatuses, useLiveAvailability } from "./catalog-data.ts";
import { CatalogCards } from "./catalog-cards.tsx";
import { serif } from "./ui.ts";

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
    <section id="estimate" aria-labelledby="pricing-estimate-title" tabIndex={-1} className="scroll-mt-24">
      <Card className="gap-0 overflow-hidden p-0">
        <div className="grid md:grid-cols-2">
          <div className="p-5 sm:p-6">
            <h2 id="pricing-estimate-title" className="text-heading font-strong leading-heading tracking-heading">Request estimator</h2>
            <p className="mt-2 text-ui text-muted-foreground">One text request, without cached input.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Model"
                className="sm:col-span-2"
                control={(field) => (
                  <Select {...field} value={modelId} onChange={(event) => setModelId(event.target.value)} className="h-11">
                    {chatModels.map((model) => {
                      const route = chatModelRoute(model);
                      return route && (
                        <option key={model.provider + route.modelId} value={route.modelId}>
                          {model.name}
                        </option>
                      );
                    })}
                  </Select>
                )}
              />
              {fields.map(({ id, label, value, setValue, max, invalid }) => (
                <Field
                  key={id}
                  controlId={id}
                  label={label}
                  error={invalid ? `Enter a whole number from 0 to ${max.toLocaleString("en-US")}.` : undefined}
                  control={(field) => (
                    <Input
                      {...field}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={max}
                      step={1}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      className="h-11 font-mono"
                    />
                  )}
                />
              ))}
            </div>
          </div>
          <figure className="border-t border-border bg-accent/40 p-5 sm:p-6 md:border-t-0 md:border-l">
            <figcaption className="text-ui font-medium">Estimated charge</figcaption>
            <output data-invalid={estimate === null} className={cn("mt-2 block font-mono text-title font-medium leading-title tracking-title", estimate === null && "font-sans text-body leading-body text-muted-foreground")}>
              {estimate === null ? "Fix the token counts to see an estimate." : creditBalance(estimate)}
            </output>
            <Table aria-label="Rates per million tokens" className="mt-4 text-ui">
              <TableBody>
                <TableRow>
                  <TableHead scope="row" className="px-0 py-2 font-regular text-muted-foreground">Input / 1M</TableHead>
                  <TableCell className="px-0 py-2 text-right font-mono">{formatRate(rates.Input ?? 0)}</TableCell>
                </TableRow>
                {rates.Cached !== undefined && rates.Cached >= 0 && (
                  <TableRow>
                    <TableHead scope="row" className="px-0 py-2 font-regular text-muted-foreground">Cached input / 1M</TableHead>
                    <TableCell className="px-0 py-2 text-right font-mono">{formatRate(rates.Cached)}</TableCell>
                  </TableRow>
                )}
                <TableRow className="border-b-0">
                  <TableHead scope="row" className="px-0 py-2 font-regular text-muted-foreground">Output / 1M</TableHead>
                  <TableCell className="px-0 py-2 text-right font-mono">{formatRate(rates.Output ?? 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="mt-3 text-meta text-muted-foreground">Final charges use reported token counts, including cached input.</p>
            <Button asChild variant="ghost" size="sm" className="mt-3 px-0 text-primary">
              <a href="#inference-rates">
                Compare provider rates <ArrowDown size={14} aria-hidden="true" />
              </a>
            </Button>
          </figure>
        </div>
      </Card>
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
    <section className="mt-14" aria-labelledby="pricing-essentials-title">
      <h2 id="pricing-essentials-title" className="text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">How billing works</h2>
      <ul className="mt-6 grid gap-6 md:grid-cols-3" role="list">
        {terms.map(({ title, copy, href, link }) => (
          <li key={title} className="grid content-start gap-3 border-t border-border pt-4">
            <h3 className="text-lead font-strong leading-lead">{title}</h3>
            <p className="text-ui text-muted-foreground">{copy}</p>
            <Button asChild variant="ghost" size="sm" className="justify-start px-0 text-primary">
              <a href={href}>
                {link} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InferenceRates() {
  const live = useLiveAvailability();
  return (
    <section className="mt-14 scroll-mt-24" id="inference-rates" aria-labelledby="inference-rates-title" tabIndex={-1}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="inference-rates-title" className="text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">Model rates</h2>
          <p className="mt-2 max-w-prose text-ui text-muted-foreground">
            Compare rates for {pricedGroups.length} routable models. Token rates are per million tokens;
            expand a model to see provider-specific and per-request fees.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="px-0 text-primary">
          <a href="/models">
            Model catalog <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </Button>
      </div>
      <CatalogCards groups={pricedGroups} filterSignature="pricing" statuses={liveStatuses(live)} />
    </section>
  );
}

function PricingQuestion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border last:border-b">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="h-auto w-full justify-between rounded-none px-0 py-4 text-left font-medium hover:bg-transparent"
      >
        {question}
        <Plus size={17} aria-hidden="true" className={cn("shrink-0 transition-transform duration-fast", open && "rotate-45")} />
      </Button>
      {open && <p className="pb-4 text-ui text-muted-foreground">{answer}</p>}
    </div>
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
    <section className="mt-14 grid gap-6 lg:grid-cols-[minmax(180px,0.5fr)_minmax(0,1.5fr)]" aria-labelledby="pricing-questions-title">
      <div>
        <h2 id="pricing-questions-title" className="text-heading font-strong leading-heading tracking-heading sm:text-title sm:leading-title sm:tracking-title">Billing questions</h2>
        <Button asChild variant="ghost" size="sm" className="mt-3 px-0 text-primary">
          <a href="/docs/billing">
            Read the billing guide <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </Button>
      </div>
      <div>
        {questions.map(([question, answer]) => (
          <PricingQuestion key={question} question={question} answer={answer} />
        ))}
      </div>
    </section>
  );
}

export function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12 lg:py-16">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:gap-14">
        <header>
          <h1 className="text-title font-strong leading-title tracking-title md:text-display md:leading-display md:tracking-display">
            Pay for <span style={serif} className="block font-regular">what you use.</span>
          </h1>
          <p className="mt-4 max-w-prose text-lead text-muted-foreground">
            Fund credits in USDC or SOL. Each request is charged from your balance based on reported usage.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="ghost" className="px-0 text-primary">
              <a href="#estimate">
                Estimate a request <ArrowDown size={15} aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="ghost" className="px-0 text-primary">
              <a href="#inference-rates">
                Browse model rates <ArrowDown size={15} aria-hidden="true" />
              </a>
            </Button>
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
