// spec/app/site/index.md, "Story: Check the service status"
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  KeyRound,
  Pause,
  Play,
  Plus,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, SegmentedControl, SegmentedControlItem, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import traceStyles from "./gateway-trace.module.css";
import { catalog } from "../../../../gen/app__models.ts";
import type { CatalogEntry, Route } from "../../../../gen/app__models.ts";
import { CopyButton, useAmbientMotion } from "./chrome.tsx";
import { HighlightedCode, SyntaxTokens, useSyntaxHighlight, type SyntaxLanguage } from "../../syntax.tsx";
import { Scene } from "./scene.tsx";
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
  traceStages,
  type DemoLanguage,
} from "./content.ts";
import { articles } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";
import {
  markColors,
  modelMark,
  sectionHead,
  textLink,
} from "./ui.ts";

const featured = (id: string): CatalogEntry | undefined =>
  catalog.find((entry) => entry.provider === "NearAI" && entry.upstreamId === id);
const chatRoute = (entry: CatalogEntry | undefined): Route | undefined =>
  entry?.routes.find((route) => route.endpoint === "ChatCompletions");
const featuredEntries = featuredUpstreamIds
  .map((id) => featured(id))
  .filter((entry): entry is CatalogEntry => entry !== undefined);
const demoModels = featuredEntries.slice(0, 3);
const demoSyntaxLanguages = {
  cURL: "bash",
  Python: "python",
  JavaScript: "javascript",
} as const satisfies Record<DemoLanguage, SyntaxLanguage>;

const track = `polygon(${[
  ...requestPathPoints.map(([x, y]) => `${x}% ${y}%`),
  ...[...requestPathPoints].reverse().map(([x, y]) => `${x}% calc(${y}% + 1.5px)`),
].join(", ")})`;

function RequestPath() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const motion = useAmbientMotion();
  const map = useRef<HTMLElement>(null);
  const looping = motion && !paused;
  const previous = useRef(0);
  const pulse = useRef<HTMLSpanElement>(null);
  const step = requestPathSteps[active];
  const [x, y] = requestPathPoints[step.point];

  useEffect(() => {
    const element = map.current;
    if (!looping || !element) return;
    let visible = false;
    let timer = 0;

    function sync() {
      window.clearInterval(timer);
      if (visible && !document.hidden) {
        timer = window.setInterval(
          () => setActive((step) => (step + 1) % requestPathSteps.length),
          3600,
        );
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [looping]);

  useEffect(() => {
    const from = requestPathSteps[previous.current].point;
    const to = requestPathSteps[active].point;
    previous.current = active;
    if (!motion || from === to) return;
    const path =
      from < to
        ? requestPathPoints.slice(from, to + 1)
        : requestPathPoints.slice(to, from + 1).reverse();
    const frames = path.map(([x, y]) => ({ left: `${x}%`, top: `${y}%`, opacity: 1 }));
    frames[0].opacity = 0;
    frames[frames.length - 1].opacity = 0;
    const animation = pulse.current?.animate(frames, {
      duration: 185 * Math.abs(to - from),
      easing: "linear",
    });
    return () => animation?.cancel();
  }, [active, motion]);

  function select(index: number) {
    setPaused(true);
    setActive(index);
  }

  return (
    <section
      ref={map}
      className="request-landscape"
      id="request-path"
      aria-labelledby="request-path-title"
    >
      <div
        className="request-stage"
        data-step={active}
        style={
          {
            "--route-shape": track,
            "--track-remaining": `${100 - x}%`,
            "--station-x": `${x}%`,
            "--station-y": `${y}%`,
          } as CSSProperties
        }
      >
        <div role="img" aria-label="Illustration of a Japanese forest village">
          <Scene variant="hero" />
        </div>
        <div className="request-track" aria-hidden="true">
          <div className="request-track-line" />
          <div className="request-track-progress">
            <div className="request-track-line" />
          </div>
          <span className="request-pulse" ref={pulse} />
        </div>
        <div className="request-stations" role="group" aria-labelledby="request-path-title">
          {requestPathSteps.map(({ point, label, short, icon }, index) => (
            <button
              type="button"
              className="request-station"
              key={label}
              style={{
                left: `${requestPathPoints[point][0]}%`,
                top: `${requestPathPoints[point][1]}%`,
              }}
              aria-label={`${short}: ${label}`}
              aria-pressed={active === index}
              aria-controls="request-path-detail"
              onClick={() => select(index)}
            >
              <span className="request-station-icon">
                <ProductIcon name={icon} size={16} />
              </span>
              <span className="request-station-label">{short}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="request-caption">
        <div className="request-caption-heading">
          <h2 id="request-path-title">Explore the request path</h2>
          <span className="request-step-count">
            Step {active + 1} of {requestPathSteps.length}
          </span>
        </div>
        <div className="request-caption-copy">
          <div className="request-caption-measure" aria-hidden="true">
            {requestPathSteps.map(({ label, description }) => (
              <p key={label}>
                <strong>{label}.</strong> {description}
              </p>
            ))}
          </div>
          <div id="request-path-detail" aria-live={looping ? "off" : "polite"} aria-atomic="true">
            <p key={step.label}>
              <strong>{step.label}.</strong> {step.description}
            </p>
          </div>
        </div>
        <div className="request-caption-actions">
          <a href={step.link} className="text-link">
            <span>{step.action}</span> <ArrowUpRight size={15} />
          </a>
          <Button
            type="button"
            variant="outline"
            className="button quiet request-tour-button"
            disabled={!motion}
            onClick={() => setPaused(!paused)}
          >
            {looping ? <Pause size={15} /> : <Play size={15} />}
            {!motion ? "Motion off" : looping ? "Pause trace" : "Resume trace"}
          </Button>
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
  const source = lines.join("\n");
  const highlighted = useSyntaxHighlight(source, demoSyntaxLanguages[language]);
  const sampleResponse = {
    model: modelId,
    choices: [{ index: 0, message: { role: "assistant", content: example.output } }],
  };

  return (
    <section className="home-quickstart" id="quickstart" aria-labelledby="home-quickstart-heading">
      <div className={sectionHead}>
        <h2 id="home-quickstart-heading">Send your first request.</h2>
        <div className="home-quickstart-aside">
          <p>
            <a href="/console/keys">Create an API key</a> and set <code>SONNELY_API_KEY</code>.
            Then copy the example for your language.
          </p>
          <div className="home-quickstart-links">
            <a href="/docs/quickstart" className="text-link">
              Read the quickstart <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <div className="term home-quickstart-term">
        <div className="term-chrome">
          <span className="quickstart-endpoint">
            <span className="quickstart-method">POST</span>
            <code>{apiBasePath}/chat/completions</code>
          </span>
        </div>
        <div className="quickstart-toolbar">
          <span className="quickstart-toolbar-label" id="home-api-example-label">
            Sample task
          </span>
          <SegmentedControl
            aria-labelledby="home-api-example-label"
            value={String(active)}
            onValueChange={(value) => setActive(Number(value))}
          >
            {demoExamples.map(({ label }, index) => (
              <SegmentedControlItem key={label} value={String(index)}>
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <div className="quickstart-panes">
          <div className="quickstart-request">
            <div className="quickstart-pane-head">
              <span className="quickstart-pane-label">
                Request
              </span>
              <SegmentedControl
                aria-label="Request language"
                value={language}
                onValueChange={(value) => setLanguage(value as (typeof demoLanguages)[number])}
              >
                {demoLanguages.map((option) => (
                  <SegmentedControlItem key={option} value={option}>
                    {option}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <CopyButton key={language + active} value={source} label="Copy request" />
            </div>
            <pre className="home-api-code" aria-label={language + " request"}>
              <code>
                {lines.map((line, index) => (
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- source lines never reorder
                  <span className="home-api-line" key={index}>
                    <span aria-hidden="true">{index + 1}</span>
                    <span>{highlighted ? <SyntaxTokens line={highlighted.tokens[index] ?? []} /> : line}</span>
                  </span>
                ))}
              </code>
            </pre>
          </div>
          <div className="quickstart-response">
            <div className="quickstart-pane-head">
              <span className="quickstart-pane-label">
                Sample response
              </span>
              <Button
                className="button quiet small"
                variant="ghost"
                size="sm"
                type="button"
                aria-pressed={showJson}
                onClick={() => setShowJson(!showJson)}
              >
                Show JSON
              </Button>
            </div>
            <div className="quickstart-result" aria-live="polite">
              {showJson ? (
                <pre key={active} aria-label="Sample response JSON">
                  <HighlightedCode source={JSON.stringify(sampleResponse, null, 2)} language="json" />
                </pre>
              ) : (
                <p key={active}>
                  {example.output}
                </p>
              )}
            </div>
            <div className="quickstart-response-foot">
              <span>
                <i className="term-dot" aria-hidden="true" /> {model?.name}
              </span>
              {model && (
                <a
                  className="text-link"
                  href={modelPlaygroundHref(modelId, model.provider)}
                  aria-label={"Open in playground: " + model.name}
                >
                  Open in playground <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


const traceTotal = traceStages[traceStages.length - 1].end;

function GatewayTrace() {
  return (
    <figure className={traceStyles["gateway-trace"]} data-reveal="fade">
      <figcaption className={traceStyles["gateway-trace-head"]}>
        <span className={traceStyles["gateway-trace-label"]}>
          Example trace ·{" "}
          {(traceTotal / 1000).toFixed(1)} s
        </span>
        <span className={traceStyles["gateway-trace-outcome"]}>
          <Check size={12} aria-hidden="true" /> settled
        </span>
      </figcaption>
      <div className={traceStyles["gateway-trace-bar"]} aria-hidden="true">
        {traceStages.map(({ name, start, end }) => (
          <span
            key={name}
            className={traceStyles["gateway-trace-segment"]}
            data-stage={name.split(" ")[0].toLowerCase()}
            style={{
              insetInlineStart: (start / traceTotal) * 100 + "%",
              width: ((end - start) / traceTotal) * 100 + "%",
            }}
          />
        ))}
      </div>
      <ol className={traceStyles["gateway-trace-stages"]}>
        {traceStages.map(({ name, start, end, icon }) => (
          <li key={name}>
            <ProductIcon name={icon} size={13} />
            <span className={traceStyles["gateway-trace-name"]}>{name}</span>
            <span className={traceStyles["gateway-trace-ms"]}>{end - start} ms</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const capabilities = [
  {
    title: "Check where your request ran",
    body: "Inspect the attestation published by the confidential environment.",
    href: "/inference#evidence",
    action: "Verify the evidence",
  },
  {
    title: "Get a receipt in your app",
    body: "Read request references and receipts with the TypeScript or Python SDK.",
    href: "/docs/sdks",
    action: "Install an SDK",
  },
] as const;

function HomeCapabilities() {
  return (
    <section className="section home-capabilities" aria-labelledby="capabilities-heading">
      <header className={sectionHead}>
        <h2 id="capabilities-heading">See what happened to a request.</h2>
      </header>
      <div data-home-evidence="">
        <GatewayTrace />
        <ul data-home-proof-links="" role="list">
          {capabilities.map(({ title, body, href, action }) => (
            <li key={href}>
              <h3>{title}</h3>
              <p data-home-proof-description="">{body}</p>
              <a href={href} className={textLink} data-home-proof-action="">
                {action} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HomeModelList() {
  return (
    <section className="section home-models" aria-labelledby="home-models-heading">
      <div className={sectionHead}>
        <h2 id="home-models-heading">Compare models before you run.</h2>
        <a href="/models#available-models" className={textLink}>
          Browse all models <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="home-model-catalog" data-reveal="fade">
        <div className="home-model-columns" aria-hidden="true">
          <span>Model</span>
          <span>Privacy route</span>
          <span>Context window</span>
          <span>Input / output per 1M tokens</span>
        </div>
        <ul className="home-model-list" role="list">
          {featuredEntries.map((model) => {
            const route = chatRoute(model);
            const rates = route ? routeRates(route) : {};
            const featuredType = featuredTypes[model.upstreamId];
            return (
              <li key={model.upstreamId}>
                <a
                  href={route ? modelPlaygroundHref(route.modelId, model.provider) : "/console/chat"}
                  className="home-model-row"
                >
                  <div className="catalog-identity">
                    <span
                      className={modelMark + " " + (markColors[model.color] ?? markColors.smoke)}
                      aria-hidden="true"
                    >
                      {model.mark || (model.name.match(/[a-z0-9]/i)?.[0].toUpperCase() ?? "•")}
                    </span>
                    <div>
                      <h3>{model.name}</h3>
                      <p>{model.summary}</p>
                    </div>
                  </div>
                  <span className="home-model-route">{routeLabels[model.privacy]}</span>
                  <span className="home-model-context">
                    {featuredType?.context ?? "—"} <span>tokens</span>
                  </span>
                  <span className="home-model-rates">
                    {formatRate(rates.Input ?? 0)} <span>/</span> {formatRate(rates.Output ?? 0)}
                    <small>input / output per 1M</small>
                  </span>
                  <span className="home-model-action">
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


function KeyPreview() {
  return (
    <>
      <div className="preview-hero">
        <strong>$5.00</strong>
        <span>daily cap</span>
      </div>
      <dl>
        <div>
          <dt>key</dt>
          <dd>docs-assistant</dd>
        </div>
        <div>
          <dt>lifetime cap</dt>
          <dd>$75.00</dd>
        </div>
        <div>
          <dt>expiry</dt>
          <dd>30 days</dd>
        </div>
      </dl>
    </>
  );
}

function UsagePreview() {
  return (
    <>
      <div className="preview-hero">
        <strong>$0.000193</strong>
        <span>charge · glm 5.3 flash</span>
        <div className="preview-usage-bar" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
      <dl>
        <div>
          <dt>input tokens</dt>
          <dd>1,240</dd>
        </div>
        <div>
          <dt>output tokens</dt>
          <dd>186</dd>
        </div>
      </dl>
    </>
  );
}

function PaymentPreview() {
  return (
    <>
      <div className="preview-hero">
        <strong>+$5.00</strong>
        <span>compute credits</span>
      </div>
      <dl>
        <div>
          <dt>payment</dt>
          <dd>5.00 usdc</dd>
        </div>
        <div>
          <dt>network</dt>
          <dd>solana mainnet</dd>
        </div>
        <div>
          <dt>status</dt>
          <dd>
            finalized <Check size={12} aria-hidden="true" />
          </dd>
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
    icon: Activity,
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
      "When checkout is enabled, top up with USDC or SOL and verify the finalized transfer.",
    link: "/docs/billing",
    action: "Read the funding guide",
    Preview: PaymentPreview,
  },
] as const;

function WorkspacePreview() {
  const [active, setActive] = useState<string>(workspaceCards[0].id);

  return (
    <section className="section home-workspace" aria-labelledby="workspace-title">
      <div className={sectionHead}>
        <h2 id="workspace-title">Control what you spend.</h2>
        <a className={textLink} href="/pricing">
          See pricing <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <Tabs value={active} onValueChange={setActive} className="workspace-showcase">
        <TabsList className="workspace-tabs" aria-label="Workspace preview">
          {workspaceCards.map(({ id, label, icon: Icon }) => (
            <TabsTrigger value={id} key={id}>
              <Icon size={18} aria-hidden="true" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {workspaceCards.map(({ id, previewTitle, icon: Icon, title, description, link, action, Preview }) => (
          <TabsContent className="workspace-preview" value={id} key={id}>
            <div className="workspace-preview-copy">
              <h3>{title}</h3>
              <p>{description}</p>
              <a className={textLink} href={link}>
                {action} <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="workspace-visual">
              <figure className="preview-data">
                <figcaption>
                  <Icon size={15} aria-hidden="true" /> <strong>{previewTitle}</strong>
                  <small>Sample data</small>
                </figcaption>
                <div className="preview-body">
                  <Preview />
                </div>
              </figure>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

const featuredArticles = ["read-a-gateway-trace", "choose-a-model", "credits-and-quotes"];

function HomeResources() {
  return (
    <>
      <section className="section home-guides" aria-labelledby="guides-heading">
        <div className={sectionHead}>
          <h2 id="guides-heading">Build and verify with Sonnely.</h2>
          <a className={textLink} href="/blog">
            Read the journal <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="home-resources">
          {featuredArticles.map((slug) => {
            const article = articles.find((item) => item.slug === slug)!;
            return (
              <a href={"/blog/" + slug} className="resource-row" key={slug}>
                <span>{article.category}</span>
                <div>
                  <h3>{article.title}</h3>
                  <p>{article.summary}</p>
                </div>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            );
          })}
        </div>
      </section>
      <section className="section home-split home-faq" aria-labelledby="questions-heading">
        <div className="home-section-intro" data-reveal="rise">
          <h2 id="questions-heading">Before you get started.</h2>
          <a className={textLink} href="/contact">
            Contact Sonnely <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="faq" data-home-faq-list="">
          <details name="home-questions" data-reveal="fade">
            <summary>
              What can I try without a wallet? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Explore the model catalog or try a sample in the playground. To send a live request,
              connect an eligible wallet and add credits.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              What can I send through the API? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Send text Chat Completions requests with up to {limits.messages} messages and request
              up to {limits.maxOutputTokens.toLocaleString("en-US")} output tokens. See{" "}
              <a href="/docs/api#request-limits" aria-label="Request limits in the API reference">request limits</a> for the JSON size cap.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              What does the usage ledger store? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              It records the model, key label, token counts, request status, and charge. The gateway
              reads prompt text during forwarding. Playground chat history is kept server-side under
              your wallet, and Settings can turn it off or erase it.{" "}
              <a href="/docs/attestation#data-handling" aria-label="Data handling in the attestation guide">Read about data handling</a>.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              Can I use a Solana Seeker? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Open Sonnely in Chrome on Seeker and choose Solana mobile wallet when connecting. At
              checkout, you can also open a Solana Pay link or scan its QR code with a compatible
              wallet. <a href="/docs/billing" aria-label="Mobile checkout steps in the billing guide">See the mobile checkout steps</a>.
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
      <section className="wrap hero" aria-labelledby="home-hero-heading">
        <div className="hero-intro">
          <h1 id="home-hero-heading">
            Private AI.<br />
            <span>Prove it.</span>
          </h1>
          <p className="hero-description">
            Run models through an OpenAI-compatible API. Check the attestation to see where your
            request ran, and the receipt to see what it cost.
          </p>
          <div className="actions">
            <Button asChild className="rounded-full">
              <a href="#quickstart">
                API quickstart <ArrowDown size={16} aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <a href="/console/chat">
                Open playground <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
        <RequestPath />
      </section>
      <div className="wrap home">
        <HomeDemo />
        <HomeCapabilities />
        <HomeModelList />
        <WorkspacePreview />
        <HomeResources />
        <section
          className="home-closing"
          aria-labelledby="home-closing-heading"
          data-reveal="fade"
        >
          <div>
            <h2 id="home-closing-heading">Try an example. Then run your own.</h2>
            <p>
              Open the playground for a sample, or follow the setup guide to send a live API request.
            </p>
          </div>
          <div className="actions">
            <Button asChild className="rounded-full">
              <a href="/console/chat">
                Open playground <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <a href="/docs/quickstart">
                Read the setup guide <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
