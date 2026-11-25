// spec/app/docs/index.md, "Story: Read the documentation" — the `@`-directives of a
// body, rendered as the components they name, markdown around them.
import {
  Box,
  Cpu,
  Fingerprint,
  LifeBuoy,
  Rocket,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Streamdown, type Components } from "streamdown";
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
          {block.children.map((step, i) => (
            <div key={i} className="fd-step">
              <Blocks blocks={step.kind === "step" ? step.children : [step]} />
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
  const tab = tabs[active] ?? tabs[0];
  return (
    <div className="docs-tabs">
      <div className="docs-tabs-list" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={i === active ? "docs-tab-active" : undefined}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab && (
        <div className="docs-tab-panel" role="tabpanel">
          <Blocks blocks={tab.children} />
        </div>
      )}
    </div>
  );
}

function ApiReference() {
  const rows: Endpoint[] = apiEndpoints;
  return (
    <div className="docs-api-reference">
      <p>
        Base URL: <code>{apiOrigin + apiBasePath}</code>
      </p>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={`${e.method} ${e.path}`}>
              <td>
                <code>{e.method}</code>
              </td>
              <td>
                <a href={e.anchor}>
                  <code>{e.path}</code>
                </a>
              </td>
              <td>{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

const mdComponents: Components = {
  h2: ({ children }) => <h2 id={slugify(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))}>{children}</h3>,
  a: ({ href = "", children }) => (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
      {children}
    </a>
  ),
};

export function Markdown({ lines }: { lines: string[] }) {
  const text = lines.join("\n").trim();
  if (text === "") return null;
  return (
    <div className="docs-prose">
      <Streamdown components={mdComponents}>{text}</Streamdown>
    </div>
  );
}
