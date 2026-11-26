// spec/app/site/index.md, "Story: Check the service status"
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  FileText,
  Fingerprint,
  KeyRound,
  Pause,
  Play,
  Plus,
  ScanLine,
  Server,
  Terminal,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { catalog } from "../../../../gen/app__models.ts";
import type { CatalogEntry, Route } from "../../../../gen/app__models.ts";
import { CopyButton, useAmbientMotion } from "./chrome.tsx";
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
  type DemoLanguage,
} from "./content.ts";
import { articles } from "./journal.ts";
import { PlatformLinks } from "./products.tsx";
import { ProductIcon } from "./icons.tsx";
import {
  buttonAccent,
  buttonQuiet,
  cardLinkArrow,
  eyebrow,
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
const codeToken = /("(?:\\.|[^"\\])*"|\b(?:curl|import|from|const|new|await)\b|-(?:H|d)(?=\s))/g;

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
          <h2 id="request-path-title">Follow the request</h2>
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
          <button
            type="button"
            className="button quiet request-tour-button"
            disabled={!motion}
            onClick={() => setPaused(!paused)}
          >
            {looping ? <Pause size={15} /> : <Play size={15} />}
            {!motion ? "Motion off" : looping ? "Pause trace" : "Resume trace"}
          </button>
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

  return (
    <section className="home-quickstart" id="quickstart" aria-labelledby="home-quickstart-heading">
      <div className="home-quickstart-intro" data-reveal="rise">
        <h2 id="home-quickstart-heading">Your first API request.</h2>
        <p>
          <a href="/console/keys">Create an API key</a> and export it as{" "}
          <code>SONNELY_API_KEY</code>. Pick a language, then copy the example into your terminal or
          app.
        </p>
        <div className="home-quickstart-links">
          <a href="/docs/quickstart" className="text-link">
            Read the quickstart <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a href="/docs/sdks" className="text-link">
            SDKs <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="home-api-samples">
          <p id="home-api-example-label">Example</p>
          <div
            className="home-api-segments"
            role="group"
            aria-labelledby="home-api-example-label"
            style={{ "--segment": active } as CSSProperties}
          >
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
      <div className="home-api" data-reveal="fade">
        <div className="home-api-endpoint">
          <span className="home-api-method">POST</span>
          <code>{apiBasePath}/chat/completions</code>
        </div>
        <div className="home-api-panes">
          <div className="home-api-request">
            <div className="home-api-pane-head">
              <div
                className="home-api-segments"
                role="group"
                aria-label="Request language"
                style={{ "--segment": demoLanguages.indexOf(language) } as CSSProperties}
              >
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
            <pre className="home-api-code" aria-label={language + " request"}>
              <code>
                {lines.map((line, index) => (
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- source lines never reorder
                  <span className="home-api-line" key={index}>
                    <span aria-hidden="true">{index + 1}</span>
                    <span>
                      {line.split(codeToken).map((token, index) =>
                        index % 2 === 0 ? (
                          token
                        ) : (
                          <span
                            className={token.startsWith('"') ? "home-api-string" : "home-api-keyword"}
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
          <div className="home-api-response" aria-labelledby="home-api-response-title">
            <div className="home-api-pane-head">
              <h3 id="home-api-response-title">Sample response</h3>
              <button
                className="button quiet small"
                type="button"
                aria-pressed={showJson}
                onClick={() => setShowJson(!showJson)}
              >
                JSON
              </button>
            </div>
            <div className="home-api-result" aria-live="polite">
              {showJson ? (
                <pre key={active} aria-label="Sample response JSON">
                  <code>{JSON.stringify(sampleResponse, null, 2)}</code>
                </pre>
              ) : (
                <p key={active} className={active === 1 ? "mono" : undefined}>
                  {example.output}
                </p>
              )}
            </div>
            <div className="home-api-response-footer">
              <span>{model?.name}</span>
              {model && (
                <a
                  className="text-link"
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

function RouteSample() {
  return (
    <div className="gateway-sample gateway-route">
      <p>Example route</p>
      <ul>
        <li data-selected="">
          <Server size={15} aria-hidden="true" /> <strong>Confidential TEE</strong>
          <span>
            <Check size={13} aria-hidden="true" /> Selected
          </span>
        </li>
      </ul>
    </div>
  );
}

function EndpointSample() {
  return (
    <div className="gateway-sample gateway-endpoint">
      <span>POST</span>
      <code>
        {apiBasePath}/chat/
        <wbr />
        completions
      </code>
    </div>
  );
}

function BudgetSample() {
  return (
    <div className="gateway-sample gateway-budget">
      <p>Example key budget</p>
      <dl>
        <div>
          <dt>Daily limit</dt>
          <dd>$5.00</dd>
        </div>
        <div>
          <dt>Lifetime limit</dt>
          <dd>$75.00</dd>
        </div>
      </dl>
    </div>
  );
}

function FundingPath() {
  return (
    <div className="gateway-sample gateway-funding">
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
    <section className="section home-capabilities" aria-labelledby="capabilities-heading">
      <header className={sectionHead}>
        <div>
          <p className={eyebrow}>The gateway</p>
          <h2 id="capabilities-heading">From request to receipt.</h2>
        </div>
        <p>Send a request, set a limit, and see what you were charged.</p>
      </header>
      <ul className="gateway-grid" role="list">
        {capabilities.map(({ id, icon: Icon, title, body, href, action, Sample }) => (
          <li
            key={id}
            className={"gateway-tile gateway-tile-" + id}
            data-reveal={id === "route" ? "fade" : "rise"}
          >
            <div className="gateway-tile-copy">
              <span className="home-feature-icon">
                <Icon size={19} aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </div>
            <Sample />
            <a href={href} className="text-link">
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
    <section className="section home-models" aria-labelledby="home-models-heading">
      <div className={sectionHead}>
        <h2 id="home-models-heading">Choose your model.</h2>
        <a href="/models#available-models" className={textLink}>
          Compare models and pricing <ArrowRight size={16} aria-hidden="true" />
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
    <section className="section home-workloads" aria-labelledby="workloads-heading">
      <div className={sectionHead}>
        <h2 id="workloads-heading">Start with a real task.</h2>
      </div>
      <div className="home-workload-grid">
        {workloads.map(({ icon: Icon, title, prompt, model }) => {
          const entry = featuredEntries[model];
          const route = entry ? chatRoute(entry) : undefined;
          return (
            <article className="workload-card" key={title} data-reveal="rise">
              <span className="home-feature-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <blockquote>“{prompt}”</blockquote>
              {entry && route && (
                <a className="text-link" href={modelPlaygroundHref(route.modelId, entry.provider)}>
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

function KeyPreview() {
  return (
    <>
      <p className="mono preview-name">docs-assistant</p>
      <dl>
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
      <p className="mono preview-name">GLM 5.3 Flash</p>
      <div className="preview-usage-bar" aria-hidden="true">
        <span />
        <span />
      </div>
      <dl>
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
      <p className="mono preview-name">5.00 USDC</p>
      <dl>
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
      "When checkout is enabled, fund credits with USDC and verify the finalized transfer.",
    link: "/docs/billing",
    action: "See how settlement works",
    Preview: PaymentPreview,
  },
] as const;

function WorkspacePreview() {
  const [active, setActive] = useState(0);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowUp":
        next = (index + workspaceCards.length - 1) % workspaceCards.length;
        break;
      case "ArrowDown":
        next = (index + 1) % workspaceCards.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = workspaceCards.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
    event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
  }

  return (
    <section className="section home-workspace" aria-labelledby="workspace-title">
      <div className={sectionHead}>
        <h2 id="workspace-title">Keys, usage, and credits.</h2>
        <a className={textLink} href="/models#billing">
          See pricing <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="workspace-showcase" data-reveal="fade">
        <div
          className="workspace-tabs"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Workspace preview"
        >
          {workspaceCards.map(({ id, label, icon: Icon }, index) => (
            <button
              id={"workspace-tab-" + id}
              type="button"
              role="tab"
              key={id}
              aria-selected={active === index}
              aria-controls={"workspace-panel-" + id}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <Icon size={18} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {workspaceCards.map(
          ({ id, previewTitle, icon: Icon, title, description, link, action, Preview }, index) => (
            <div
              className="workspace-preview"
              id={"workspace-panel-" + id}
              role="tabpanel"
              aria-labelledby={"workspace-tab-" + id}
              hidden={index !== active}
              tabIndex={0}
              key={id}
            >
              {index === active && (
                <>
                  <div className="workspace-visual">
                    <img
                      src={"/homepage/" + id + ".webp"}
                      alt=""
                      width={840}
                      height={560}
                      loading="lazy"
                    />
                    <figure className="preview-data">
                      <figcaption>
                        <Icon size={15} aria-hidden="true" /> <strong>{previewTitle}</strong>
                        <small>Example</small>
                      </figcaption>
                      <Preview />
                    </figure>
                  </div>
                  <div className="workspace-preview-copy">
                    <h3>{title}</h3>
                    <p>{description}</p>
                    <a className={textLink} href={link}>
                      {action} <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  </div>
                </>
              )}
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
      <section className="section home-guides" aria-labelledby="guides-heading">
        <div className={sectionHead}>
          <h2 id="guides-heading">Practical guides.</h2>
          <a className={textLink} href="/blog">
            Read the journal <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="home-resources">
          {featuredArticles.map((slug) => {
            const article = articles.find((item) => item.slug === slug)!;
            return (
              <a href={"/blog/" + slug} className="resource-row" key={slug} data-reveal="rise">
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
          <h2 id="questions-heading">Good to know.</h2>
          <a className={textLink} href="/contact">
            Contact Sonnely <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="faq">
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
              <a href="/docs/api#request-limits">request limits</a> for the JSON size cap.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              What does the usage ledger store? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              It records the model, key label, token counts, request status, and charge. The gateway
              reads prompt text during forwarding. Optional chat history lives in your browser.{" "}
              <a href="/docs/attestation#data-handling">Read about data handling</a>.
            </p>
          </details>
          <details name="home-questions" data-reveal="fade">
            <summary>
              Can I use a Solana Seeker? <Plus size={17} aria-hidden="true" />
            </summary>
            <p>
              Open Sonnely in Chrome on Seeker and choose Solana mobile wallet when connecting. At
              checkout, you can also open a Solana Pay link or scan its QR code with a compatible
              wallet. <a href="/docs/billing">See the mobile checkout steps</a>.
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
      <section className="hero" aria-labelledby="home-hero-heading">
        <div className="wrap hero-intro">
          <h1 id="home-hero-heading">
            Private AI<span>.</span>
          </h1>
          <div className="hero-content">
            <p className="hero-description">
              Confidential inference for your apps through one OpenAI-compatible API.
            </p>
            <div className="actions">
              <a href="/console/chat" className={buttonAccent}>
                Open console <ArrowUpRight size={17} aria-hidden="true" />
              </a>
              <a href="#quickstart" className={buttonQuiet}>
                API quickstart <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <RequestPath />
      </section>
      <div className="wrap home">
        <HomeDemo />
        <nav className="home-platform" data-reveal="fade" aria-label="Platform integrations">
          <a href="/docs/billing">
            <span className="home-platform-icon">
              <Wallet size={18} aria-hidden="true" />
            </span>
            <span>
              <strong>Solana</strong>
              <small>Wallet sign-in and USDC funding</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" className={cardLinkArrow} />
          </a>
          <a href="/inference#routing">
            <span className="home-platform-icon">
              <Fingerprint size={18} aria-hidden="true" />
            </span>
            <span>
              <strong>Confidential compute</strong>
              <small>Hardware-isolated execution</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" className={cardLinkArrow} />
          </a>
          <a href="/docs/api">
            <span className="home-platform-icon">
              <Terminal size={18} aria-hidden="true" />
            </span>
            <span>
              <strong>OpenAI-compatible API</strong>
              <small>Chat Completions</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" className={cardLinkArrow} />
          </a>
        </nav>
        <HomeCapabilities />
        <HomeModelList />
        <HomeWorkloads />
        <WorkspacePreview />
        <PlatformLinks className="home-directory" />
        <HomeResources />
        <section
          className="closing home-closing"
          aria-labelledby="home-closing-heading"
          data-reveal="fade"
        >
          <Scene />
          <div>
            <h2 id="home-closing-heading">Start in the console.</h2>
            <p>
              Try a sample in the playground. When you’re ready to run a live request, connect your
              Solana wallet.
            </p>
          </div>
          <div className="actions">
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
