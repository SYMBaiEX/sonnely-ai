// spec/app/docs/index.md, "Story: Read the documentation" — the `@`-directives of a
// body, rendered as the components they name, markdown around them.
import {
  ArrowDown,
  ArrowUpRight,
  Box,
  Braces,
  ChevronDown,
  Copy,
  Cpu,
  Fingerprint,
  LifeBuoy,
  Play,
  Rocket,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { defaultComponents, Streamdown, type Components } from "streamdown";
import "streamdown/styles.css";
import { apiEndpoints, type Endpoint } from "../../../../gen/app__docs.ts";
import { apiBasePath, apiOrigin, slugify, type Block } from "../../../docs.ts";

const ICONS: Record<string, typeof Box> = {
  terminal: Terminal,
  box: Box,
  fingerprint: Fingerprint,
  shieldcheck: ShieldCheck,
  rocket: Rocket,
  cpu: Cpu,
  lifebuoy: LifeBuoy,
};

const BOX_CLASSES: Record<string, string> = {
  overview: "docs-overview",
  start: "docs-start",
  guidegrid: "docs-guide-grid",
  support: "docs-overview-support",
  facts: "docs-guide-facts",
  procedure: "docs-guide-procedure",
  sequence: "docs-event-sequence",
  next: "docs-guide-next",
};

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block_ key={i} block={block} />
      ))}
    </>
  );
}

function Block_({ block }: { block: Block }) {
  switch (block.kind) {
    case "md":
      return <Markdown lines={block.lines} />;
    case "box": {
      const cls = BOX_CLASSES[block.box] ?? `docs-box-${block.box}`;
      const content = <Blocks blocks={block.children} />;
      if (block.box === "guidegrid" || block.box === "next") {
        return (
          <nav className={cls} aria-label={block.label}>
            {content}
          </nav>
        );
      }
      if (block.box === "support") {
        return (
          <aside className={cls} aria-label={block.label}>
            {content}
          </aside>
        );
      }
      return <div className={cls}>{content}</div>;
    }
    case "card": {
      const Icon = ICONS[block.icon] ?? Box;
      return (
        <a className={`docs-start-card${block.primary ? " docs-start-card-primary" : ""}`} href={block.href}>
          <Icon size={20} />
          <span className="docs-start-card-title">{block.title}</span>
          <span className="docs-start-card-description">{block.description}</span>
        </a>
      );
    }
    case "group": {
      const Icon = ICONS[block.icon];
      return (
        <section className="docs-guide-group">
          <h3 id={block.id}>
            {Icon && <Icon size={16} />} {block.title}
          </h3>
          <ul>
            {block.children.map((child, i) => (
              <li key={i}>
                <Block_ block={child} />
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "link":
      return (
        <a id={block.id === "" ? undefined : block.id} href={block.href}>
          {block.title}
        </a>
      );
    case "steps":
      return (
        <div className="fd-steps">
          {block.children
            .filter((step): step is Block & { kind: "step" } => step.kind === "step")
            .map((step, i) => (
              <div key={i} className="fd-step">
                <Blocks blocks={step.children} />
              </div>
            ))}
        </div>
      );
    case "step":
      return (
        <div className="fd-step">
          <Blocks blocks={block.children} />
        </div>
      );
    case "tabs":
      return <Tabs block={block} />;
    case "tab":
      return null;
    case "apiref":
      return <ApiReference />;
  }
}

function Tabs({ block }: { block: Block & { kind: "tabs" } }) {
  const tabs = block.children.filter((c): c is Block & { kind: "tab" } => c.kind === "tab");
  const [active, setActive] = useState(0);
  const tabRef = useRef<HTMLButtonElement[]>([]);
  const tab = tabs[active] ?? tabs[0];
  const id = useId();
  const tabId = (index: number) => `${id}-tab-${index}`;
  const panelId = (index: number) => `${id}-panel-${index}`;
  const activate = (index: number) => {
    setActive(index);
    tabRef.current[index]?.focus();
  };
  return (
    <div className="docs-tabs">
      <div className="docs-tabs-list" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            id={tabId(i)}
            aria-selected={i === active}
            aria-controls={panelId(i)}
            className={i === active ? "docs-tab-active" : undefined}
            ref={(element) => {
              if (element) tabRef.current[i] = element;
            }}
            onClick={() => setActive(i)}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (offset === 0) return;
              event.preventDefault();
              activate((active + offset + tabs.length) % tabs.length);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab && (
        <div
          className="docs-tab-panel"
          role="tabpanel"
          id={panelId(active)}
          aria-labelledby={tabId(active)}
          tabIndex={0}
        >
          <Blocks blocks={tab.children} />
        </div>
      )}
    </div>
  );
}

const TRYIT_KEY_STORAGE = "sonnely.docs.tryit.key";

const JSON_EXAMPLES: Record<string, Record<string, unknown>> = {
  "/chat/completions": {
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    messages: [{ role: "user", content: "Summarize this request in one sentence." }],
    max_tokens: 64,
  },
  "/embeddings": { model: "Qwen/Qwen3-Embedding-0.6B", input: "Solana transaction" },
  "/rerank": {
    model: "Qwen/Qwen3-Reranker-0.6B",
    query: "Solana network fees",
    documents: ["Solana charges a small fee per transaction.", "The sky is blue."],
  },
  "/images/generations": { model: "black-forest-labs/FLUX.2-klein-4B", prompt: "A watercolor painting of a quiet harbor at dawn" },
  "/systemone": {
    model: "levanto/sage-2",
    state: "The request asks about billing.",
    questions: { decision: { type: "noul", instructions: "Is this about billing?" } },
  },
  "/responses": { model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", input: "Explain what a Solana transaction fee covers.", stream: false, store: false },
  "/redact": { model: "pii-filter", text: "Contact the sample customer at alice@example.com." },
  "/audio/speech": { model: "voxtral-tts", input: "Welcome to Sonnely." },
};

const UPLOAD_ENDPOINTS: Record<string, string> = {
  "/images/edits": "a multipart image upload",
  "/audio/transcriptions": "a multipart audio upload",
  "/audio/translations": "a multipart WAV upload",
  "/convert/file": "a multipart PDF upload",
  "/realtime": "a WebSocket session",
};

function ApiReference() {
  const rows: Endpoint[] = apiEndpoints;
  const baseUrl = apiOrigin + apiBasePath;
  const [open, setOpen] = useState("");
  const [apiKey, setApiKeyState] = useState(() => {
    try {
      return localStorage.getItem(TRYIT_KEY_STORAGE) ?? "";
    } catch {
      return "";
    }
  });
  const setApiKey = (key: string) => {
    setApiKeyState(key);
    try {
      localStorage.setItem(TRYIT_KEY_STORAGE, key);
    } catch {}
  };
  return (
    <div className="docs-api-entry">
      <div className="docs-api-base">
        <div>
          <span>
            <Braces size={16} aria-hidden="true" /> Base URL
          </span>
          <code>{baseUrl}</code>
        </div>
        <CopyBaseUrl value={baseUrl} />
      </div>
      <div className="docs-endpoints" role="list" aria-label="API endpoints">
        {rows.map((endpoint) => {
          const expanded = open === endpoint.path;
          return (
            <div className="docs-endpoint" key={endpoint.path} data-open={expanded ? "" : undefined} role="listitem">
              <button
                type="button"
                className="docs-endpoint-row"
                aria-expanded={expanded}
                aria-controls={`tryit-${endpoint.path.replaceAll("/", "-")}`}
                onClick={() => setOpen(expanded ? "" : endpoint.path)}
              >
                <span className="docs-http-method" data-method={endpoint.method}>
                  {endpoint.method}
                </span>
                <span>
                  <code>{endpoint.path}</code>
                  <small>{endpoint.description}</small>
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {expanded && (
                <TryPanel endpoint={endpoint} apiKey={apiKey} onKeyChange={setApiKey} baseUrl={baseUrl} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TryPanel({
  endpoint,
  apiKey,
  onKeyChange,
  baseUrl,
}: {
  endpoint: Endpoint;
  apiKey: string;
  onKeyChange: (key: string) => void;
  baseUrl: string;
}) {
  const example = JSON_EXAMPLES[endpoint.path];
  const upload = UPLOAD_ENDPOINTS[endpoint.path];
  const testable = example !== undefined || (endpoint.method === "GET" && upload === undefined);
  const isPublic = endpoint.method === "GET" && endpoint.path === "/models";
  const [body, setBody] = useState(() => (example ? JSON.stringify(example, null, 2) : ""));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ status: number; ok: boolean; text: string } | null>(null);
  const [bodyError, setBodyError] = useState("");

  const send = async () => {
    let parsed: string | undefined;
    if (example !== undefined) {
      try {
        parsed = JSON.stringify(JSON.parse(body));
        setBodyError("");
      } catch {
        setBodyError("The body is not valid JSON.");
        return;
      }
    }
    setSending(true);
    setResult(null);
    try {
      const headers: Record<string, string> = {};
      if (parsed !== undefined) headers["Content-Type"] = "application/json";
      if (apiKey.trim() !== "") headers.Authorization = `Bearer ${apiKey.trim()}`;
      const response = await fetch(apiBasePath + endpoint.path, {
        method: endpoint.method,
        headers,
        body: parsed,
      });
      const type = response.headers.get("content-type") ?? "";
      let text: string;
      if (type.includes("json")) {
        text = JSON.stringify(await response.json(), null, 2);
      } else if (type.startsWith("audio/") || type.includes("octet-stream")) {
        const bytes = await response.arrayBuffer();
        text = `Binary ${type || "response"} — ${bytes.byteLength.toLocaleString()} bytes. File responses download in the Playground or your client.`;
      } else {
        text = await response.text();
      }
      setResult({ status: response.status, ok: response.ok, text: text.slice(0, 4000) });
    } catch (cause) {
      setResult({ status: 0, ok: false, text: cause instanceof Error ? cause.message : "The request failed to reach the gateway." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="docs-tryit" id={`tryit-${endpoint.path.replaceAll("/", "-")}`}>
      <div className="docs-tryit-url">
        <code>
          {endpoint.method} {baseUrl + endpoint.path}
        </code>
        <a href={endpoint.anchor} className="docs-tryit-link">
          Reference <ArrowDown size={12} aria-hidden="true" />
        </a>
        <a href="/console/chat" className="docs-tryit-link">
          Playground <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      </div>
      {!isPublic && testable && (
        <label className="docs-tryit-key">
          <span>API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => onKeyChange(event.target.value)}
            placeholder="Paste a workspace key"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
      {example !== undefined && (
        <label className="docs-tryit-body">
          <span>JSON body</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={Math.min(12, body.split("\n").length + 1)} spellCheck={false} />
        </label>
      )}
      {bodyError !== "" && <p className="docs-tryit-error">{bodyError}</p>}
      {testable ? (
        <div className="docs-tryit-actions">
          <button type="button" className="docs-tryit-send" disabled={sending} onClick={() => void send()}>
            <Play size={13} aria-hidden="true" /> {sending ? "Sending…" : `Send ${endpoint.method}`}
          </button>
          {endpoint.method !== "GET" && apiKey.trim() === "" && <small>Without a key the gateway answers 401 — itself a live response.</small>}
        </div>
      ) : (
        <p className="docs-tryit-note">
          This endpoint needs {upload ?? "a file upload"}. Try it in the <a href="/console/chat">console Playground</a> with your signed-in
          workspace.
        </p>
      )}
      {result !== null && (
        <div className="docs-tryit-result" data-ok={result.ok ? "" : undefined}>
          <span className="docs-tryit-status" data-ok={result.ok ? "" : undefined}>
            {result.status === 0 ? "Network error" : `HTTP ${result.status}`}
          </span>
          <pre>{result.text}</pre>
        </div>
      )}
    </div>
  );
}

function CopyBaseUrl({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="docs-copy-base"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      onBlur={() => setCopied(false)}
      onPointerLeave={() => setCopied(false)}
    >
      <Copy size={14} aria-hidden="true" /> {copied ? "Copied" : "Copy base URL"}
    </button>
  );
}

/** Markdown inline into `h2`/`h3` so their ids and the contents list agree. */
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

const DefaultCode = defaultComponents.code;

function DocsCode(props: ComponentProps<typeof DefaultCode>) {
  const metastring = props.node?.properties?.metastring;
  const title =
    typeof metastring === "string" ? /(?:^|\s)title="([^"]+)"/.exec(metastring)?.[1] : undefined;
  if (title === undefined || props.className?.includes("language-") !== true) {
    return <DefaultCode {...props} />;
  }
  return (
    <div className="docs-titled-code">
      <DefaultCode {...props} />
      <div className="docs-code-title">{title}</div>
    </div>
  );
}

const mdComponents: Components = {
  code: DocsCode,
  h2: ({ children }) => <h2 id={slugify(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))}>{children}</h3>,
  a: ({ href = "", children }) => (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
      {children}
    </a>
  ),
};

function dedentMarkdown(text: string) {
  let fence = "";
  return text
    .split("\n")
    .map((line) => {
      const marker = /^ {0,3}(```+|~~~+)/.exec(line)?.[1];
      if (fence !== "") {
        if (marker?.startsWith(fence[0])) fence = "";
        return line;
      }
      if (marker) {
        fence = marker[0];
        return line;
      }
      return line.startsWith("    ") ? line.slice(4) : line;
    })
    .join("\n");
}

export function Markdown({ lines }: { lines: string[] }) {
  const text = lines
    .join("\n")
    .trim()
    .replace(/\n(?=\d+\. \*\*)/g, "\n\n");
  if (text === "") return null;
  const dedented = dedentMarkdown(text);
  return (
    <div className="docs-prose">
      <Streamdown
        components={mdComponents}
        mode="static"
        normalizeHtmlIndentation
        lineNumbers={false}
        controls={{ code: { copy: true, download: false }, table: false, image: false }}
      >
        {dedented}
      </Streamdown>
    </div>
  );
}
