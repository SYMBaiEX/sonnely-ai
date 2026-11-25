// spec/app/models.md, "Story: Filter the catalog"
import { ArrowDown, ArrowRight, ArrowUpRight, Boxes, Calculator, Fingerprint, KeyRound, Search, Wallet } from "lucide-react";
import { useState } from "react";
import { Input } from "@repo/ui";
import { useMachine } from "../../../../gen/app__models.react.ts";
import {
  catalog,
  type Availability,
  type CatalogEntry,
  type CatalogFilter,
  type Event,
  type Endpoint,
  type ProviderId,
  type RateUnit,
  type Route,
  type Sort,
} from "../../../../gen/app__models.ts";
import type { Board, ProbeState } from "../../../../gen/app__site.ts";
import { useRemote } from "../../remote.ts";
import { CopyButton, SiteLead } from "./chrome.tsx";
import {
  apiBasePath,
  computeQuote,
  contextFormat,
  creditBalance,
  endpointDocs,
  endpointPaths,
  featuredTypes,
  featuredUpstreamIds,
  formatRate,
  limits,
  markupPercent,
  modelDetailHref,
  modelPlaygroundHref,
  providerNames,
  providerOfSlug,
  requestCharge,
  routeLabels,
  routeRates,
  upstreamCoversEndpoint,
  upstreamWorkloadLabel,
  workloadGuide,
  workloadNames,
} from "./data.ts";
import { catalogRuntime } from "./filter.ts";
import { entryActions, pages } from "./content.ts";
import { PlatformLinks } from "./products.tsx";
import {
  buttonAccent,
  caption,
  faqBody,
  faqCard,
  faqSummary,
  featureIcon,
  markColors,
  modelMark,
  monoSm,
  panel,
  searchBox,
  sectionHead,
  selectClass,
  serif,
  textLink,
  wrap,
} from "./ui.ts";

const endpointIds = Object.keys(workloadNames) as Endpoint[];

function RateList({ rates }: { rates: Partial<Record<RateUnit, number>> }) {
  const labels: readonly (readonly [RateUnit, string])[] = [
    ["Input", "input / 1M tokens"],
    ["Cached", "cached input / 1M tokens"],
    ["Output", "output / 1M tokens"],
    ["PerRequest", "per request"],
    ["PerSession", "per session"],
  ];
  return (
    <ul className="grid gap-1 text-[13px]" role="list">
      {labels.map(([key, label]) =>
        rates[key] === undefined ? null : (
          <li key={key}>
            <strong className="font-medium">{formatRate(rates[key])}</strong>{" "}
            <span className="text-muted-foreground">{label}</span>
          </li>
        ),
      )}
    </ul>
  );
}

function probeStates(board: Board | undefined): Partial<Record<ProviderId, ProbeState>> {
  if (board?.tag !== "Live") return {};
  const states: Partial<Record<ProviderId, ProbeState>> = {};
  for (const probe of board.report.probes) {
    const provider = providerOfSlug[probe.provider];
    if (provider) states[provider] = probe.state;
  }
  return states;
}

function CatalogTools({
  filter,
  send,
}: {
  filter: CatalogFilter;
  send: (event: Event) => unknown;
}) {
  const providerValue = filter.provider.tag === "Only" ? filter.provider.provider : "";
  const workloadValue = filter.workload.tag === "OnEndpoint" ? filter.workload.endpoint : "";
  return (
    <div className="mb-5 grid gap-3 min-[900px]:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] min-[900px]:items-end">
        <label className={searchBox}>
          <Search size={17} aria-hidden="true" />
          <Input
            type="search"
            value={filter.query}
            onChange={(event) => void send({ type: "search", query: event.target.value })}
            placeholder="Find a model"
            aria-label="Find a model"
            className="border-0 bg-transparent px-0 shadow-none"
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>Provider</span>
          <select
            className={selectClass}
            value={providerValue}
            onChange={(event) =>
              void send({
                type: "chooseProvider",
                provider: event.target.value
                  ? { tag: "Only", provider: event.target.value as ProviderId }
                  : { tag: "EveryProvider" },
              })
            }
          >
            <option value="">All providers</option>
            {(Object.keys(providerNames) as ProviderId[]).map((id) => (
              <option key={id} value={id}>
                {providerNames[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>Workload</span>
          <select
            className={selectClass}
            value={workloadValue}
            onChange={(event) =>
              void send({
                type: "chooseWorkload",
                workload: event.target.value
                  ? { tag: "OnEndpoint", endpoint: event.target.value as Endpoint }
                  : { tag: "EveryWorkload" },
              })
            }
          >
            <option value="">All workloads</option>
            {endpointIds.map((id) => (
              <option key={id} value={id}>
                {workloadNames[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>Availability</span>
          <select
            className={selectClass}
            value={filter.availability}
            onChange={(event) =>
              void send({
                type: "chooseAvailability",
                availability: event.target.value as Availability,
              })
            }
          >
            <option value="AnyAvailability">All models</option>
            <option value="Available">Available on Sonnely</option>
            <option value="CatalogOnly">Provider catalog only</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          <span>Sort models</span>
          <select
            className={selectClass}
            value={filter.sort}
            onChange={(event) =>
              void send({ type: "chooseSort", sort: event.target.value as Sort })
            }
          >
            <option value="AvailableFirst">Available first</option>
            <option value="ByName">Model name</option>
            <option value="ByInputRate">Lowest input token rate</option>
            <option value="ByOutputRate">Lowest output token rate</option>
          </select>
        </label>
    </div>
  );
}

export function ModelCatalog() {
  const { state, send } = useMachine(catalogRuntime);
  const remote = useRemote<Board>("site");
  const probes = probeStates(remote.state);
  const probed = Object.keys(probes).length > 0;
  const filter = state ?? {
    query: "",
    provider: { tag: "EveryProvider" } as const,
    workload: { tag: "EveryWorkload" } as const,
    availability: "AnyAvailability" as Availability,
    sort: "AvailableFirst" as Sort,
  };

  const isAvailable = (entry: CatalogEntry) =>
    entry.routes.length > 0 && (!probed || probes[entry.provider] === "Ok");
  const chosenProvider = filter.provider.tag === "Only" ? filter.provider.provider : undefined;
  const chosenEndpoint =
    filter.workload.tag === "OnEndpoint" ? filter.workload.endpoint : undefined;
  const query = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const displayed = catalog.flatMap((model) => {
    const available = isAvailable(model);
    if (chosenProvider && chosenProvider !== model.provider) return [];
    if (filter.availability === "Available" && !available) return [];
    if (filter.availability === "CatalogOnly" && model.routes.length > 0) return [];

    const routes =
      chosenEndpoint === undefined
        ? model.routes
        : model.routes.filter((route) => route.endpoint === chosenEndpoint);
    if (
      chosenEndpoint !== undefined &&
      !routes.length &&
      (model.routes.length || !upstreamCoversEndpoint(model.workload, chosenEndpoint))
    )
      return [];

    const searchable = [
      model.name,
      model.upstreamId,
      providerNames[model.provider],
      model.provider,
      routeLabels[model.privacy],
      model.workload,
      model.summary,
      ...model.routes.flatMap((route) => [
        route.modelId,
        endpointPaths[route.endpoint],
        workloadNames[route.endpoint],
      ]),
    ]
      .join(" ")
      .toLowerCase();
    return query.every((term) => searchable.includes(term))
      ? [{ model, routes, available }]
      : [];
  });

  if (filter.sort === "ByInputRate" || filter.sort === "ByOutputRate") {
    const unit: RateUnit = filter.sort === "ByInputRate" ? "Input" : "Output";
    const price = (entry: (typeof displayed)[number]) =>
      Math.min(...entry.routes.map((route) => routeRates(route)[unit] ?? Infinity));
    displayed.sort((a, b) => price(a) - price(b));
  } else if (filter.sort === "ByName") {
    displayed.sort((a, b) => a.model.name.localeCompare(b.model.name));
  } else {
    displayed.sort((a, b) => Number(b.available) - Number(a.available));
  }

  return (
    <>
      <CatalogTools filter={filter} send={send} />
      <p className={caption + " mb-3"} role="status">
        {displayed.length === 0
          ? "No models match your filters."
          : `${displayed.length} provider ${displayed.length === 1 ? "entry" : "entries"}`}
      </p>
      {displayed.length > 0 && (
        <div className={panel + " overflow-x-auto p-0"} id="model-rates">
          <table aria-label="Model rates and context" className="w-full min-w-200 text-sm">
            <thead>
              <tr className="border-b border-border text-start text-[11px] uppercase tracking-wider text-muted-foreground [&>th]:px-5 [&>th]:py-3 [&>th]:text-start [&>th]:font-medium">
                <th scope="col">Model</th>
                <th scope="col">Context</th>
                <th scope="col">Endpoints and rates</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(({ model, routes, available }) => {
                const id = routes[0]?.modelId ?? model.upstreamId;
                const chat =
                  available && routes.find((route) => route.endpoint === "ChatCompletions");
                return (
                  <tr
                    key={model.provider + "/" + model.upstreamId}
                    className="border-b border-border align-top last:border-b-0 [&>td]:px-5 [&>td]:py-4.5 [&>th]:px-5 [&>th]:py-4.5 [&>th]:text-start [&>th]:font-normal"
                  >
                    <th scope="row">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span
                          aria-hidden="true"
                          className={modelMark + " " + (markColors[model.color] ?? markColors.smoke)}
                        >
                          {model.mark ||
                            (model.name.match(/[a-z0-9]/i)?.[0].toUpperCase() ?? "•")}
                        </span>
                        <div>
                          <h3 className="text-[15px] font-medium">
                            <a href={modelDetailHref(model)} className="hover:underline">{model.name}</a>
                          </h3>
                          <span className="block text-xs text-muted-foreground">
                            {providerNames[model.provider]} · {routeLabels[model.privacy]}
                          </span>
                          <code className={monoSm + " block text-muted-foreground"}>{id}</code>
                        </div>
                      </div>
                    </th>
                    <td className="whitespace-nowrap">
                      <span className="text-xs text-muted-foreground min-[900px]:hidden" aria-hidden="true">
                        Context
                      </span>
                      {model.context ? `${contextFormat.format(model.context)} tokens` : "—"}
                    </td>
                    <td className="min-w-75">
                      {routes.length ? (
                        <>
                          {!available && (
                            <p className={caption + " text-warn"}>Unavailable</p>
                          )}
                          <ul className="grid gap-2.5" role="list">
                            {routes.map((route) => (
                              <li key={route.endpoint}>
                                <a
                                  href={endpointDocs(route.endpoint)}
                                  className={textLink}
                                  aria-label={`/${endpointPaths[route.endpoint]} · ${workloadNames[route.endpoint]} guide`}
                                >
                                  <code>/{endpointPaths[route.endpoint]}</code>
                                </a>
                                {route.modelId !== id && (
                                  <code className={monoSm + " block text-muted-foreground"}>{route.modelId}</code>
                                )}
                                <RateList rates={routeRates(route)} />
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-medium">Provider catalog only</span>
                          <span className={caption}>
                            {upstreamWorkloadLabel(model.workload)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="w-40">
                      <div className="flex flex-col items-start gap-2">
                        {chat && (
                          <a
                            href={modelPlaygroundHref(chat.modelId, model.provider)}
                            className={textLink}
                          >
                            Open in chat <ArrowUpRight size={15} aria-hidden="true" />
                          </a>
                        )}
                        <CopyButton
                          value={id}
                          label={`Copy ID for ${model.name} on ${providerNames[model.provider]}`}
                          text="Copy ID"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={caption + " mt-3 [&_a]:underline [&_a]:underline-offset-3"}>
        Sonnely rates include a {markupPercent}% markup.{" "}
        <a href="/docs/providers#compare-prices">How pricing works</a>
        {" · "}
        <a href={apiBasePath + "/provider-models"}>Catalog JSON</a>
      </p>
    </>
  );
}

function ModelGuide() {
  const entries = featuredUpstreamIds
    .map((id) => catalog.find((entry) => entry.provider === "NearAI" && entry.upstreamId === id))
    .filter((entry): entry is CatalogEntry => entry !== undefined);
  return (
    <section className="my-14 grid max-w-200 gap-3" aria-labelledby="compare-models-heading">
      <h2 id="compare-models-heading" style={serif} className="text-[clamp(23px,3.5vw,32px)] font-normal">
        Compare models by workload
      </h2>
      <p className="text-sm text-muted-foreground">
        Chat Completions models accept and return text through Sonnely. Start with one
        representative prompt and compare the output before committing a budget.
      </p>
      <dl className="my-3 grid gap-3">
        {entries.map((model) => {
          const type = featuredTypes[model.upstreamId]?.type as keyof typeof workloadGuide | undefined;
          return (
            <div key={model.upstreamId} className="grid gap-0.5 min-[800px]:grid-cols-[180px_minmax(0,1fr)] min-[800px]:gap-6">
              <dt className="text-sm font-medium">{model.name}</dt>
              <dd className="text-sm text-muted-foreground">{type ? workloadGuide[type] : model.summary}</dd>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">
        The context window describes the underlying model. Sonnely currently accepts up to{" "}
        {limits.bodyBytes.toLocaleString("en-US")} bytes per request and returns up to{" "}
        {limits.maxOutputTokens.toLocaleString("en-US")} output tokens.
      </p>
      <a className={textLink} href="/docs/api#request-limits">
        See request limits <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

function tokens(value: string, maximum: number) {
  const count = Number(value);
  return value !== "" && Number.isSafeInteger(count) && count >= 0 && count <= maximum
    ? count
    : null;
}

const chatModels = catalog.filter((entry) =>
  entry.routes.some((route) => route.endpoint === "ChatCompletions"),
);

function chatModelRoute(entry: CatalogEntry): Route | undefined {
  return entry.routes.find((route) => route.endpoint === "ChatCompletions");
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
    <section className={panel + " my-14 grid gap-5"} aria-labelledby="cost-example-heading">
      <header className="flex items-center gap-3.5">
        <span className={featureIcon}>
          <Calculator size={21} aria-hidden="true" />
        </span>
        <div>
          <h2 id="cost-example-heading" className="text-lg font-medium">Estimate a request</h2>
          <p className="text-sm text-muted-foreground">Compare uncached text requests at Sonnely’s published token rates.</p>
        </div>
      </header>
      <div className="grid gap-4 min-[800px]:grid-cols-3">
        <label className="grid gap-1.5 text-sm">
          Model
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
        <label className="grid gap-1.5 text-sm">
          Input tokens
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
        <label className="grid gap-1.5 text-sm">
          Output tokens
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
      <div className="grid gap-2.5 rounded-md border border-border bg-secondary p-4.5">
        <p className="text-xs text-muted-foreground">Estimated charge</p>
        <output aria-live="polite" className="text-2xl font-medium">
          {estimate === null ? "Check token counts" : creditBalance(estimate)}
        </output>
        <dl aria-label="Rates per million tokens" className="flex gap-8 text-[13px]">
          <div>
            <dt className="text-muted-foreground">Input / 1M tokens</dt>
            <dd>{formatRate(rates.Input ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Output / 1M tokens</dt>
            <dd>{formatRate(rates.Output ?? 0)}</dd>
          </div>
        </dl>
      </div>
      <footer className="flex flex-wrap items-center gap-4">
        <p className="text-[13px] text-muted-foreground">Actual charges use reported usage and account for cached input.</p>
        <a className={textLink} href="/models#model-rates">
          Compare model rates <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </section>
  );
}

export function ModelsPage() {
  const [title, description] = pages.models;
  const entry = entryActions.models;
  const runnable = new Set(
    catalog.flatMap((model) => model.routes.map((route) => route.modelId)),
  ).size;
  return (
    <div className={wrap + " inner-page market-page"}>
      <SiteLead
        title={title}
        description={description}
        brief={{
          title: "Sonnely catalog",
          rows: [
            ["Available model IDs", String(runnable)],
            ["Provider entries", String(catalog.length)],
            ["Providers", "NEAR AI, Phala, Tinfoil"],
          ],
        }}
      >
        <div className="mt-5.5 flex items-center gap-4">
          <a href={entry.section} className={buttonAccent}>
            {entry.label} <ArrowDown size={15} aria-hidden="true" />
          </a>
          <a href={entry.next} className={textLink}>
            {entry.action} <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </SiteLead>
      <section
        className="my-10 grid gap-4"
        id="available-models"
        aria-labelledby="model-comparison-title"
      >
        <header className={sectionHead}>
          <div>
            <h2 id="model-comparison-title" style={serif} className="text-[clamp(26px,4vw,38px)] font-normal leading-tight">
              Models and rates
            </h2>
            <p className="text-sm text-muted-foreground">Compare provider routes, supported endpoints, and pricing.</p>
          </div>
        </header>
        <ModelCatalog />
        <a className={textLink} href="/inference#routing">
          How routing works <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </section>
      <ModelGuide />
      <CostExample />
      <section className="my-14" id="billing" aria-labelledby="billing-basics">
        <header className={sectionHead}>
          <h2 id="billing-basics" style={serif} className="text-[clamp(26px,4vw,38px)] font-normal leading-tight">
            How billing works
          </h2>
        </header>
        <div className="grid gap-3.5 min-[800px]:grid-cols-3">
          <article className={panel + " grid content-start gap-2.5 [&>svg]:size-6 [&>svg]:text-primary"}>
            <Wallet aria-hidden="true" />
            <h3 className="text-base font-medium">Prepaid credits</h3>
            <p className="text-sm text-muted-foreground">
              After signing in and accepting the current terms, choose a credit amount and pay with
              USDC or SOL. Credits post automatically when the Solana transfer finalizes.
            </p>
            <a className={textLink} href="/console/billing">
              Billing console <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
          <article className={panel + " grid content-start gap-2.5 [&>svg]:size-6 [&>svg]:text-primary"}>
            <KeyRound aria-hidden="true" />
            <h3 className="text-base font-medium">Per-key budgets</h3>
            <p className="text-sm text-muted-foreground">
              Set limits on daily and total spend, choose an expiration, and revoke keys
              immediately.
            </p>
            <a className={textLink} href="/console/keys">
              Manage keys <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
          <article className={panel + " grid content-start gap-2.5 [&>svg]:size-6 [&>svg]:text-primary"}>
            <Fingerprint aria-hidden="true" />
            <h3 className="text-base font-medium">Token rates</h3>
            <p className="text-sm text-muted-foreground">Published token rates include a {markupPercent}% Sonnely markup on compute costs.</p>
            <a className={textLink} href="/models#available-models">
              Compare token rates <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
        </div>
      </section>
      <section id="compute-pricing" className={panel + " my-14"} aria-labelledby="compute-pricing-title">
        <header className="mb-4 flex items-center gap-3">
          <Boxes size={22} aria-hidden="true" />
          <h2 id="compute-pricing-title" className="text-lg font-medium">Compute pricing</h2>
        </header>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            A 15-minute Small Blackbox with 20 GB SSD is estimated at{" "}
            {creditBalance(computeQuote("blackboxes", 15).total)}. Review the full reservation
            before starting.
          </p>
          <a className={textLink} href="/blackboxes#rental">
            Explore Blackbox rentals <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <a className={textLink} href="/dry-docks">
            Explore Dry Docks
          </a>
        </div>
      </section>
      <section className="my-14" aria-labelledby="billing-questions">
        <header className={sectionHead}>
          <h2 id="billing-questions" style={serif} className="text-[clamp(26px,4vw,38px)] font-normal leading-tight">
            Billing questions
          </h2>
          <a className={textLink} href="/docs/billing">
            Credits and checkout <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </header>
        <div className="grid gap-2">
          <details name="billing-questions" className={faqCard}>
            <summary className={faqSummary}>What do I need to buy credits?</summary>
            <p className={faqBody}>
              Use a compatible Solana wallet with enough SOL for network fees. Sign in with the
              wallet that will pay, then choose SOL or USDC in Billing. A USDC payment can also
              require token account setup.
            </p>
          </details>
          <details name="billing-questions" className={faqCard}>
            <summary className={faqSummary}>How do API key budgets work?</summary>
            <p className={faqBody}>
              Sonnely reserves a maximum estimated charge before sending each request. It releases
              the difference when usage settles. Unreported usage can leave a reservation pending
              reconciliation.
            </p>
          </details>
          <details name="billing-questions" className={faqCard}>
            <summary className={faqSummary}>Where can I see what a request cost?</summary>
            <p className={faqBody}>
              Open Usage in the console to review token counts, request status and charges. Billing
              lists payment receipts separately.
            </p>
          </details>
          <details name="billing-questions" className={faqCard}>
            <summary className={faqSummary}>Do devnet payments create credits?</summary>
            <p className={faqBody}>
              Devnet payments verify the checkout path. Spendable credits require a verified
              mainnet payment.
            </p>
          </details>
        </div>
      </section>
      <PlatformLinks compact />
    </div>
  );
}
