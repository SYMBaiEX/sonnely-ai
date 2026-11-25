// spec/app/site/index.md, "Story: Check the service status"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  FileText,
  Fingerprint,
  KeyRound,
  Plus,
  ScanLine,
  Server,
  Terminal,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { catalog } from "../../../../gen/app__models.ts";
import type { CatalogEntry, Route } from "../../../../gen/app__models.ts";
import { CopyButton } from "./chrome.tsx";
import {
  apiBasePath,
  featuredTypes,
  featuredUpstreamIds,
  formatRate,
  limits,
  modelPlaygroundHref,
  routeLabels,
  routeRates,
} from "./data.ts";
import {
  demoExamples,
  demoLanguages,
  requestCode,
  requestPathPoints,
  requestPathSteps,
  type DemoLanguage,
} from "./content.ts";
import { articles } from "./journal.ts";
import { PlatformLinks } from "./products.tsx";
import { JournalIndex } from "./journal-index.tsx";
import { ProductIcon } from "./icons.tsx";
import {
  buttonAccent,
  buttonQuiet,
  buttonSmall,
  cardLink,
  cardLinkArrow,
  eyebrow,
  featureIcon,
  markColors,
  modelMark,
  monoSm,
  sectionHead,
  sectionIntro,
  serif,
  textLink,
  wrap,
} from "./ui.ts";

const featured = (id: string): CatalogEntry | undefined =>
  catalog.find((entry) => entry.provider === "NearAI" && entry.upstreamId === id);
const chatRoute = (entry: CatalogEntry | undefined): Route | undefined =>
  entry?.routes.find((route) => route.endpoint === "ChatCompletions");
const featuredEntries = featuredUpstreamIds
  .map((id) => featured(id))
  .filter((entry): entry is CatalogEntry => entry !== undefined);
const demoModels = featuredEntries.slice(0, 3);
const codeToken = /("(?:\\.|[^"\\])*"|\b(?:curl|import|from|const|new|await)\b|-(?:H|d)(?=\s))/g;

function RequestPath() {
  const [active, setActive] = useState(0);
  const step = requestPathSteps[active];
  const [x, y] = requestPathPoints[step.point];
  const trail = requestPathPoints.map(([px, py]) => `${px},${py}`).join(" ");
  const done = requestPathPoints
    .slice(0, step.point + 1)
    .map(([px, py]) => `${px},${py}`)
    .join(" ");

  return (
    <section className="mt-12 grid items-stretch gap-8 min-[900px]:grid-cols-[minmax(0,1fr)_340px]" aria-labelledby="request-path-title">
      <div className="relative min-h-80 overflow-hidden rounded-lg border border-border bg-card">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={trail}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1.5"
            strokeDasharray="1 5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={done}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={x} cy={y} r="1.4" fill="var(--primary)" />
        </svg>
        <div className="absolute inset-0" role="group" aria-labelledby="request-path-title">
          {requestPathSteps.map(({ point, label, short, icon }, index) => (
            <button
              type="button"
              className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center gap-1"
              key={label}
              style={{
                left: `${requestPathPoints[point][0]}%`,
                top: `${requestPathPoints[point][1]}%`,
              }}
              aria-label={`${short}: ${label}`}
              aria-pressed={active === index}
              aria-controls="request-path-detail"
              onClick={() => setActive(index)}
            >
              <span
                className={
                  "grid size-9.5 place-items-center rounded-full border bg-card shadow-sm transition-colors duration-base " +
                  (active === index
                    ? "border-ring text-primary"
                    : "border-border text-muted-foreground")
                }
              >
                <ProductIcon name={icon} size={16} />
              </span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {short}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5.5">
        <div className="flex items-center justify-between gap-3">
          <h2 style={serif} className="text-2xl font-normal">
            Follow the request
          </h2>
          <span className="text-xs text-muted-foreground">
            Step {active + 1} of {requestPathSteps.length}
          </span>
        </div>
        <div id="request-path-detail" aria-live="polite" aria-atomic="true">
          <p key={step.label} className="text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{step.label}.</strong> {step.description}
          </p>
        </div>
        <div className="mt-auto">
          <a href={step.link} className={textLink}>
            <span>{step.action}</span> <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function HomeDemo() {
  const [active, setActive] = useState(0);
  const [language, setLanguage] = useState<DemoLanguage>("cURL");
  const [showJson, setShowJson] = useState(false);
  const example = demoExamples[active];
  const model = demoModels[active] ?? featuredEntries[0];
  const modelId = model ? (chatRoute(model)?.modelId ?? model.upstreamId) : "";
  const lines = requestCode(language, modelId, example.instruction + "\n\n" + example.input);
  const sampleResponse = {
    model: modelId,
    choices: [{ index: 0, message: { role: "assistant", content: example.output } }],
  };
  const segments =
    "inline-flex gap-0.5 rounded-sm border border-border bg-secondary p-0.75 [&>button]:rounded-[calc(var(--radius-sm)-3px)] [&>button]:px-3 [&>button]:py-1 [&>button]:text-[13px] [&>button]:text-muted-foreground [&>button[aria-pressed=true]]:bg-accent [&>button[aria-pressed=true]]:text-accent-foreground";

  return (
    <section id="quickstart" className="mt-18 grid items-start gap-8 min-[900px]:grid-cols-[300px_minmax(0,1fr)]" aria-labelledby="home-quickstart-heading">
      <div>
        <h2 style={serif} className="mb-2.5 text-3xl font-normal">
          Your first API request.
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <a href="/console/keys" className="text-foreground underline underline-offset-3">
            Create an API key
          </a>{" "}
          and export it as <code className={monoSm}>SONNELY_API_KEY</code>. Pick a language, then copy
          the example into your terminal or app.
        </p>
        <div className="mt-4 flex gap-4">
          <a href="/docs/quickstart" className={textLink}>
            Read the quickstart <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a href="/docs/sdks" className={textLink}>
            SDKs <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="mt-6">
          <p id="home-api-example-label" className="mb-2 text-xs text-muted-foreground">
            Example
          </p>
          <div className={segments} role="group" aria-labelledby="home-api-example-label">
            {demoExamples.map(({ label }, index) => (
              <button
                type="button"
                key={label}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-border px-4.5 py-3 font-mono text-[13px]">
          <span className="rounded bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
            POST
          </span>
          <code>{apiBasePath}/chat/completions</code>
        </div>
        <div className="grid min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="border-b border-border min-[900px]:border-b-0 min-[900px]:border-e">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
              <div className={segments} role="group" aria-label="Request language">
                {demoLanguages.map((option) => (
                  <button
                    type="button"
                    key={option}
                    aria-pressed={language === option}
                    onClick={() => setLanguage(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <CopyButton key={language + active} value={lines.join("\n")} label="Copy request" />
            </div>
            <pre className="min-h-65 overflow-auto p-3.5 font-mono text-xs leading-relaxed" aria-label={language + " request"}>
              <code>
                {lines.map((line, index) => (
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- source lines never reorder
                  <span className="grid grid-cols-[28px_minmax(0,1fr)]" key={index}>
                    <span aria-hidden="true" className="pe-3 text-end text-muted-foreground opacity-60 select-none">
                      {index + 1}
                    </span>
                    <span>
                      {line.split(codeToken).map((token, index) =>
                        index % 2 === 0 ? (
                          token
                        ) : (
                          <span
                            className={token.startsWith('"') ? "text-ok" : "text-info"}
                            /* eslint-disable-next-line @eslint-react/no-array-index-key -- code tokens never reorder */
                            key={index}
                          >
                            {token}
                          </span>
                        ),
                      )}
                    </span>
                  </span>
                ))}
              </code>
            </pre>
          </div>
          <div aria-labelledby="home-api-response-title">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
              <h3 id="home-api-response-title" className="text-[13px] font-medium">
                Sample response
              </h3>
              <button
                className={buttonSmall}
                type="button"
                aria-pressed={showJson}
                onClick={() => setShowJson(!showJson)}
              >
                JSON
              </button>
            </div>
            <div className="min-h-50 p-4 text-sm leading-relaxed" aria-live="polite">
              {showJson ? (
                <pre key={active} aria-label="Sample response JSON" className={monoSm + " overflow-auto"}>
                  <code>{JSON.stringify(sampleResponse, null, 2)}</code>
                </pre>
              ) : (
                <p key={active} className={active === 1 ? "font-mono" : undefined}>
                  {example.output}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
              <span>{model?.name}</span>
              {model && (
                <a
                  className={textLink}
                  href={modelPlaygroundHref(modelId, model.provider)}
                  aria-label={"Open in playground: " + model.name}
                >
                  Open in playground <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const sampleBox = "grid gap-2 rounded-sm border border-dashed border-border p-3.5 text-[13px] text-muted-foreground";

function RouteSample() {
  return (
    <div className={sampleBox}>
      <p>Example route</p>
      <ul>
        <li className="flex items-center gap-2 text-foreground">
          <Server size={15} aria-hidden="true" /> <strong>Confidential TEE</strong>
          <span className="ms-auto inline-flex items-center gap-1 text-xs text-ok">
            <Check size={13} aria-hidden="true" /> Selected
          </span>
        </li>
      </ul>
    </div>
  );
}

function EndpointSample() {
  return (
    <div className={sampleBox + " grid-flow-col items-center justify-start gap-3"}>
      <span className="rounded bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
        POST
      </span>
      <code className="font-mono text-[13px]">
        {apiBasePath}/chat/
        <wbr />
        completions
      </code>
    </div>
  );
}

function BudgetSample() {
  return (
    <div className={sampleBox}>
      <p>Example key budget</p>
      <dl className="grid gap-1.5">
        <div className="flex justify-between">
          <dt>Daily limit</dt>
          <dd>$5.00</dd>
        </div>
        <div className="flex justify-between">
          <dt>Lifetime limit</dt>
          <dd>$75.00</dd>
        </div>
      </dl>
    </div>
  );
}

function FundingPath() {
  return (
    <div className={sampleBox + " grid-flow-col items-center justify-center gap-3.5 font-mono"}>
      <span>USDC or SOL</span>
      <ArrowRight size={16} aria-hidden="true" />
      <span>Compute credits</span>
    </div>
  );
}

const capabilities = [
  {
    id: "route",
    icon: Fingerprint,
    title: "Confidential inference",
    body: "Run models on confidential compute and check the evidence published for each request.",
    href: "/inference#evidence",
    action: "Verify the attestation",
    Sample: RouteSample,
  },
  {
    id: "api",
    icon: Braces,
    title: "OpenAI-compatible requests",
    body: "Keep your Chat Completions client. Point it at Sonnely and choose a model ID.",
    href: "/docs/api",
    action: "See the API",
    Sample: EndpointSample,
  },
  {
    id: "budget",
    icon: KeyRound,
    title: "A budget for each key",
    body: "Set daily and lifetime limits for each key. See what each request cost in Usage.",
    href: "/docs/keys",
    action: "Set up API keys",
    Sample: BudgetSample,
  },
  {
    id: "funding",
    icon: Wallet,
    title: "Solana sign-in and funding",
    body: "Sign in with your Solana wallet. When checkout is available, top up with USDC or SOL.",
    href: "/docs/billing",
    action: "See how funding works",
    Sample: FundingPath,
  },
] as const;

function HomeCapabilities() {
  return (
    <section className="my-18" aria-labelledby="capabilities-heading">
      <header className={sectionHead}>
        <div>
          <p className={eyebrow}>The gateway</p>
          <h2 style={serif} className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight" id="capabilities-heading">
            From request to receipt.
          </h2>
        </div>
        <p className={sectionIntro}>Send a request, set a limit, and see what you were charged.</p>
      </header>
      <ul className="grid gap-3.5 min-[800px]:grid-cols-2" role="list">
        {capabilities.map(({ id, icon: Icon, title, body, href, action, Sample }) => (
          <li key={id} className="flex flex-col gap-4.5 rounded-lg border border-border bg-card p-5.5">
            <div className="flex gap-3.5">
              <span className={featureIcon}>
                <Icon size={19} aria-hidden="true" />
              </span>
              <div>
                <h3 className="mb-1.5 text-[17px] font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </div>
            <Sample />
            <a href={href} className={textLink + " mt-auto"}>
              {action} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeModelList() {
  return (
    <section className="my-18" aria-labelledby="home-models-heading">
      <div className={sectionHead}>
        <h2 style={serif} className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight" id="home-models-heading">
          Choose your model.
        </h2>
        <a href="/models#available-models" className={textLink}>
          Compare models and pricing <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_0.9fr_0.8fr_1.2fr_60px] gap-4 border-b border-border px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground min-[900px]:grid" aria-hidden="true">
          <span>Model</span>
          <span>Privacy route</span>
          <span>Context window</span>
          <span>Input / output per 1M tokens</span>
        </div>
        <ul role="list">
          {featuredEntries.map((model) => {
            const route = chatRoute(model);
            const rates = route ? routeRates(route) : {};
            const featuredType = featuredTypes[model.upstreamId];
            return (
              <li key={model.upstreamId} className="border-b border-border last:border-b-0">
                <a
                  href={route ? modelPlaygroundHref(route.modelId, model.provider) : "/console/chat"}
                  className="grid items-center gap-2.5 px-5 py-4.5 hover:bg-accent min-[900px]:grid-cols-[minmax(0,2.2fr)_0.9fr_0.8fr_1.2fr_60px] min-[900px]:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className={modelMark + " " + (markColors[model.color] ?? markColors.smoke)} aria-hidden="true">
                      {model.mark || (model.name.match(/[a-z0-9]/i)?.[0].toUpperCase() ?? "•")}
                    </span>
                    <div>
                      <h3 className="text-[15px] font-medium">{model.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{model.summary}</p>
                    </div>
                  </div>
                  <span className="text-[13px] text-muted-foreground">{routeLabels[model.privacy]}</span>
                  <span className="text-sm">
                    {featuredType?.context ?? "—"} <span className="text-xs text-muted-foreground">tokens</span>
                  </span>
                  <span className="text-sm">
                    {formatRate(rates.Input ?? 0)} <span className="px-1 text-muted-foreground">/</span>{" "}
                    {formatRate(rates.Output ?? 0)}
                    <small className="block text-[11px] text-muted-foreground">
                      input / output per 1M
                    </small>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">
                    Try <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const workloads = [
  {
    icon: FileText,
    title: "Make sense of messy notes",
    prompt: "What did we decide, and what’s still open?",
    model: 0,
  },
  {
    icon: ScanLine,
    title: "Pull out the details",
    prompt: "Find the owner and due date in this handoff.",
    model: 1,
  },
  {
    icon: Code2,
    title: "Read unfamiliar code",
    prompt: "Explain how this retry delay changes after each failure.",
    model: 2,
  },
] as const;

function HomeWorkloads() {
  return (
    <section className="my-18" aria-labelledby="workloads-heading">
      <div className={sectionHead}>
        <h2 style={serif} className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight" id="workloads-heading">
          Start with a real task.
        </h2>
      </div>
      <div className="grid gap-3.5 min-[800px]:grid-cols-3">
        {workloads.map(({ icon: Icon, title, prompt, model }) => {
          const entry = featuredEntries[model];
          const route = entry ? chatRoute(entry) : undefined;
          return (
            <article className="flex flex-col gap-3.5 rounded-lg border border-border bg-card p-5.5" key={title}>
              <span className={featureIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="text-[17px] font-medium">{title}</h3>
              <blockquote className="text-sm italic text-muted-foreground">“{prompt}”</blockquote>
              {entry && route && (
                <a className={textLink + " mt-auto"} href={modelPlaygroundHref(route.modelId, entry.provider)}>
                  Try {entry.name} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const previewFacts = "grid gap-1 text-xs [&>div]:flex [&>div]:justify-between [&>div]:gap-4 [&_dt]:text-muted-foreground";

function KeyPreview() {
  return (
    <>
      <p className={monoSm + " mb-1.5"}>docs-assistant</p>
      <dl className={previewFacts}>
        <div>
          <dt>Daily cap</dt>
          <dd>$5.00</dd>
        </div>
        <div>
          <dt>Lifetime cap</dt>
          <dd>$75.00</dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>30 days</dd>
        </div>
      </dl>
    </>
  );
}

function UsagePreview() {
  return (
    <>
      <p className={monoSm + " mb-1.5"}>GLM 5.3 Flash</p>
      <div className="my-2 flex gap-1" aria-hidden="true">
        <span className="h-1.5 w-3/5 rounded bg-primary" />
        <span className="h-1.5 w-1/4 rounded bg-secondary" />
      </div>
      <dl className={previewFacts}>
        <div>
          <dt>Input tokens</dt>
          <dd>1,240</dd>
        </div>
        <div>
          <dt>Output tokens</dt>
          <dd>186</dd>
        </div>
        <div>
          <dt>Charge</dt>
          <dd>$0.000193</dd>
        </div>
      </dl>
    </>
  );
}

function PaymentPreview() {
  return (
    <>
      <p className={monoSm + " mb-1.5"}>5.00 USDC</p>
      <dl className={previewFacts}>
        <div>
          <dt>Network</dt>
          <dd>Solana mainnet</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>Finalized</dd>
        </div>
        <div>
          <dt>Compute credits</dt>
          <dd>+$5.00</dd>
        </div>
      </dl>
    </>
  );
}

const workspaceCards = [
  {
    id: "keys",
    label: "API keys",
    previewTitle: "API key",
    icon: KeyRound,
    title: "Give each app its own key",
    description:
      "Set daily and lifetime caps, choose an expiry, and revoke keys from the workspace.",
    link: "/console/keys",
    action: "Manage keys",
    Preview: KeyPreview,
  },
  {
    id: "usage",
    label: "Usage",
    previewTitle: "Request ledger",
    icon: ArrowUpRight,
    title: "See what a request cost",
    description:
      "Look up a request to see which model and key ran it, how many tokens it used, and what you paid.",
    link: "/console/usage",
    action: "View usage",
    Preview: UsagePreview,
  },
  {
    id: "funding",
    label: "Funding",
    previewTitle: "Solana Pay receipt",
    icon: Wallet,
    title: "Fund from a Solana wallet",
    description:
      "When checkout is enabled, fund credits with USDC and verify the finalized transfer.",
    link: "/docs/billing",
    action: "See how settlement works",
    Preview: PaymentPreview,
  },
] as const;

function WorkspacePreview() {
  const [active, setActive] = useState(0);
  return (
    <section className="my-18" aria-labelledby="workspace-title">
      <div className={sectionHead}>
        <h2 style={serif} className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight" id="workspace-title">
          Keys, usage, and credits.
        </h2>
        <a className={textLink} href="/models#billing">
          See pricing <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="grid gap-4.5 rounded-lg border border-border bg-card p-4.5 min-[900px]:grid-cols-[180px_minmax(0,1fr)]">
        <div className="grid grid-flow-col content-start gap-1 min-[900px]:grid-flow-row" role="tablist" aria-label="Workspace preview">
          {workspaceCards.map(({ id, label, icon: Icon }, index) => (
            <button
              type="button"
              role="tab"
              key={id}
              aria-selected={active === index}
              onClick={() => setActive(index)}
              className={
                "flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-start text-sm " +
                (active === index ? "bg-accent text-accent-foreground" : "text-muted-foreground")
              }
            >
              <Icon size={18} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {workspaceCards.map(
          ({ id, previewTitle, icon: Icon, title, description, link, action, Preview }, index) =>
            index === active && (
              <div className="grid items-center gap-6 min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" role="tabpanel" key={id}>
                <div className="relative">
                  <img
                    src={"/homepage/" + id + ".webp"}
                    alt=""
                    width={840}
                    height={560}
                    loading="lazy"
                    className="w-full rounded-md border border-border"
                  />
                  <figure className="absolute end-3 bottom-3 min-w-55 rounded-sm border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                    <figcaption className="mb-2 flex items-center gap-1.5">
                      <Icon size={15} aria-hidden="true" /> <strong>{previewTitle}</strong>
                      <small className="ms-auto text-muted-foreground">Example</small>
                    </figcaption>
                    <Preview />
                  </figure>
                </div>
                <div>
                  <h3 className="mb-2 text-[19px] font-medium">{title}</h3>
                  <p className="mb-3.5 text-sm text-muted-foreground">{description}</p>
                  <a className={textLink} href={link}>
                    {action} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                </div>
              </div>
            ),
        )}
      </div>
    </section>
  );
}

const featuredArticles = ["read-a-gateway-trace", "choose-a-model", "credits-and-quotes"];

function HomeResources() {
  return (
    <>
      <section className="my-18" aria-labelledby="guides-heading">
        <div className={sectionHead}>
          <h2 style={serif} className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight" id="guides-heading">
            Practical guides.
          </h2>
          <a className={textLink} href="/#journal-articles">
            Read the journal <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="grid gap-2">
          {featuredArticles.map((slug) => {
            const article = articles.find((item) => item.slug === slug)!;
            return (
              <a
                href={"/blog/" + slug}
                className="grid items-center gap-4.5 rounded-md border border-border bg-card px-5 py-4.5 hover:border-ring min-[800px]:grid-cols-[110px_minmax(0,1fr)_24px]"
                key={slug}
              >
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {article.category}
                </span>
                <div>
                  <h3 className="text-base font-medium">{article.title}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{article.summary}</p>
                </div>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            );
          })}
        </div>
      </section>
      <section className="my-18" aria-labelledby="questions-heading">
        <div className={sectionHead}>
          <h2 style={serif} className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight" id="questions-heading">
            Good to know.
          </h2>
          <a className={textLink} href="/contact">
            Contact Sonnely <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="grid gap-2">
          <details name="home-questions" className="rounded-md border border-border bg-card px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
              What can I try without a wallet? <Plus size={17} aria-hidden="true" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Explore the model catalog or try a sample in the playground. To send a live request,
              connect an eligible wallet and add credits.
            </p>
          </details>
          <details name="home-questions" className="rounded-md border border-border bg-card px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
              What can I send through the API? <Plus size={17} aria-hidden="true" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Send text Chat Completions requests with up to {limits.messages} messages and request
              up to {limits.maxOutputTokens.toLocaleString("en-US")} output tokens. See{" "}
              <a href="/docs/api#request-limits" className="text-foreground underline underline-offset-3">
                request limits
              </a>{" "}
              for the JSON size cap.
            </p>
          </details>
          <details name="home-questions" className="rounded-md border border-border bg-card px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
              What does the usage ledger store? <Plus size={17} aria-hidden="true" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              It records the model, key label, token counts, request status, and charge. The gateway
              reads prompt text during forwarding. Optional chat history lives in your browser.{" "}
              <a href="/docs/attestation#data-handling" className="text-foreground underline underline-offset-3">
                Read about data handling
              </a>
              .
            </p>
          </details>
          <details name="home-questions" className="rounded-md border border-border bg-card px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
              Can I use a Solana Seeker? <Plus size={17} aria-hidden="true" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Open Sonnely in Chrome on Seeker and choose Solana mobile wallet when connecting. At
              checkout, you can also open a Solana Pay link or scan its QR code with a compatible
              wallet.{" "}
              <a href="/docs/billing" className="text-foreground underline underline-offset-3">
                See the mobile checkout steps
              </a>
              .
            </p>
          </details>
        </div>
      </section>
    </>
  );
}

export function Home() {
  return (
    <>
      <section className="pt-6" aria-labelledby="home-hero-heading">
        <div className={wrap}>
          <h1 id="home-hero-heading" style={serif} className="text-[clamp(56px,10vw,128px)] font-normal leading-[0.95]">
            Private AI<span className="text-primary">.</span>
          </h1>
          <div className="mt-4.5 flex flex-wrap items-center justify-between gap-6">
            <p className="max-w-130 text-[clamp(17px,2.4vw,22px)] text-muted-foreground">
              Confidential inference for your apps through one OpenAI-compatible API.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/console/chat" className={buttonAccent}>
                Open console <ArrowUpRight size={17} aria-hidden="true" />
              </a>
              <a href="#quickstart" className={buttonQuiet}>
                API quickstart <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <div className={wrap}>
          <RequestPath />
        </div>
      </section>
      <div className={wrap}>
        <HomeDemo />
        <nav className="mt-12 grid gap-3 min-[800px]:grid-cols-3" aria-label="Platform integrations">
          <a href="/docs/billing" className={cardLink}>
            <span className="grid size-9.5 place-items-center rounded-sm bg-secondary">
              <Wallet size={18} aria-hidden="true" />
            </span>
            <span>
              <strong className="block text-sm font-medium">Solana</strong>
              <small className="text-xs text-muted-foreground">Wallet sign-in and USDC funding</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" className={cardLinkArrow} />
          </a>
          <a href="/inference#routing" className={cardLink}>
            <span className="grid size-9.5 place-items-center rounded-sm bg-secondary">
              <Fingerprint size={18} aria-hidden="true" />
            </span>
            <span>
              <strong className="block text-sm font-medium">Confidential compute</strong>
              <small className="text-xs text-muted-foreground">Hardware-isolated execution</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" className={cardLinkArrow} />
          </a>
          <a href="/docs/api" className={cardLink}>
            <span className="grid size-9.5 place-items-center rounded-sm bg-secondary">
              <Terminal size={18} aria-hidden="true" />
            </span>
            <span>
              <strong className="block text-sm font-medium">OpenAI-compatible API</strong>
              <small className="text-xs text-muted-foreground">Chat Completions</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" className={cardLinkArrow} />
          </a>
        </nav>
        <HomeCapabilities />
        <HomeModelList />
        <HomeWorkloads />
        <WorkspacePreview />
        <PlatformLinks />
        <HomeResources />
        <JournalIndex />
        <section className="my-20 flex flex-wrap items-center justify-between gap-6 rounded-lg border border-border bg-card p-9" aria-labelledby="home-closing-heading">
          <div>
            <h2 id="home-closing-heading" style={serif} className="text-[clamp(26px,4vw,36px)] font-normal">
              Start in the console.
            </h2>
            <p className="mt-2 max-w-120 text-muted-foreground">
              Try a sample in the playground. When you’re ready to run a live request, connect your
              Solana wallet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a className={buttonAccent} href="/console/chat">
              Open console <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <a className={buttonQuiet} href="/docs/sdks">
              SDKs <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
