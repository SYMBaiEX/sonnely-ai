// spec/app/docs/index.md, "Story: Read the documentation"
import {
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Fingerprint,
  List,
  Rocket,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@repo/ui";
import { docAt } from "../../../../gen/app__docs.ts";
import {
  bodyLines,
  markdownUrl,
  pageMarkdown,
  parseBlocks,
  releasedBlocks,
  releasedDocs,
  releasedDocsIn,
  releasedSections,
  releasedSlugAfter,
  releasedSlugBefore,
  searchDocs,
  tocOf,
} from "../../../docs.ts";
import { docReleased } from "../../../feature-availability.ts";
import "../site/appearance.ts";
import { MotionSwitch, AmbientVisualizer } from "../site/motion.tsx";
import { SiteHeader, useAmbientMotion, useTheme } from "../site/chrome.tsx";
import { Blocks } from "./blocks.tsx";

const sectionIcons = {
  "Get started": Rocket,
  Inference: Fingerprint,
  Compute: Box,
  Support: CircleHelp,
} as const;

export function DocsPage({ slug }: { slug: string }) {
  const doc = docAt(slug);
  const lines = useMemo(() => bodyLines(slug), [slug]);
  const blocks = useMemo(() => releasedBlocks(parseBlocks(lines)), [lines]);
  const toc = useMemo(() => tocOf(lines), [lines]);
  const before = releasedSlugBefore(slug);
  const after = releasedSlugAfter(slug);
  const released = docReleased(slug);
  const motion = useAmbientMotion();
  const theme = useTheme();
  const kind = slug === "index" ? "overview" : slug === "api" ? "api" : "guide";

  return (
    <div className="theme-root site docs-shell" data-theme={theme} data-motion={motion ? "on" : "off"}>
      <a href="#docs-page" className="skip">
        Skip to documentation
      </a>
      <div className="docs-backdrop" data-motion={motion ? "on" : "off"} aria-hidden="true">
        <div className="workspace-scene" />
        <AmbientVisualizer motion={motion} theme={theme} />
      </div>
      <SiteHeader />
      <div className="docs-layout">
        <Sidebar slug={slug} />
        <main id="docs-page" className="docs-main" tabIndex={-1}>
          {released ? (
            <article className="docs-article">
              <header className="docs-article-header" data-docs-page={kind}>
                <h1>{doc.title}</h1>
                <p className="docs-article-description">{doc.description}</p>
                <div className="docs-page-actions">
                  <CopyMarkdown slug={slug} />
                  <a className="docs-page-action" href={markdownUrl(slug)}>
                    View Markdown
                  </a>
                </div>
              </header>
              {toc.length > 1 && (
                <details className="docs-minitoc">
                  <summary>
                    <List size={15} aria-hidden="true" /> On this page
                    <span className="docs-minitoc-count">{toc.length} sections</span>
                  </summary>
                  <nav aria-label="On this page">
                    {toc.map((h) => (
                      <a key={h.id} href={`#${h.id}`} className={h.depth === 3 ? "docs-toc-sub" : undefined}>
                        {h.title}
                      </a>
                    ))}
                  </nav>
                </details>
              )}
              <div className={kind === "guide" ? "docs-guide" : undefined}>
                <Blocks blocks={blocks} />
              </div>
              <footer className="docs-prev-next" data-single={before === "" || after === "" ? "" : undefined}>
                {before === "" ? (
                  <span />
                ) : (
                  <a className="docs-pager-card" href={`/docs${before === "index" ? "" : `/${before}`}`}>
                    <span className="docs-pager-label">← Previous</span>
                    <strong>{docAt(before).title}</strong>
                    <small>{docAt(before).description}</small>
                  </a>
                )}
                {after === "" ? (
                  <span />
                ) : (
                  <a className="docs-pager-card" data-direction="next" href={`/docs/${after}`}>
                    <span className="docs-pager-label">Next →</span>
                    <strong>{docAt(after).title}</strong>
                    <small>{docAt(after).description}</small>
                  </a>
                )}
              </footer>
            </article>
          ) : (
            <article className="docs-article">
              <header className="docs-article-header" data-docs-page="guide">
                <h1>The {doc.title} guide is not available yet.</h1>
                <p className="docs-article-description">
                  This compute feature is still being built. The inference guides are ready today.
                </p>
                <div className="docs-page-actions">
                  <a className="docs-page-action" href="/docs">
                    Browse available guides
                  </a>
                </div>
              </header>
            </article>
          )}
        </main>
        {released && toc.length > 0 && (
          <aside className="docs-toc" aria-label="On this page">
            <p className="docs-toc-title">On this page</p>
            <nav>
              {toc.map((h) => (
                <a key={h.id} href={`#${h.id}`} className={h.depth === 3 ? "docs-toc-sub" : undefined}>
                  {h.title}
                </a>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}

function Sidebar({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [openSlug, setOpenSlug] = useState(slug);
  if (openSlug !== slug) {
    setOpenSlug(slug);
    setOpen(false);
  }
  const close = () => setOpen(false);
  return (
    <aside className="docs-sidebar" aria-label="Documentation sidebar" data-open={open ? "" : undefined}>
      <div className="docs-sidebar-head">
        <a href="/docs" className="docs-sidebar-brand">
          <BookOpen size={18} /> Documentation
        </a>
        <SearchDocs />
        <button
          type="button"
          className="docs-nav-toggle"
          aria-expanded={open}
          aria-controls="docs-sidebar-nav"
          onClick={() => setOpen(!open)}
        >
          <span className="docs-nav-toggle-label">
            Browse docs
            <strong>{docAt(slug).title}</strong>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <nav className="docs-sidebar-nav" id="docs-sidebar-nav" aria-label="Documentation">
        <a href="/docs" className="docs-sidebar-link" data-overview="" aria-current={slug === "index" ? "page" : undefined} onClick={close}>
          <BookOpen size={16} aria-hidden="true" />
          <span>Overview</span>
          <ChevronRight size={14} className="docs-sidebar-chevron" aria-hidden="true" />
        </a>
        {releasedSections.map((section) => {
          const Icon = sectionIcons[section as keyof typeof sectionIcons] ?? CircleHelp;
          return (
            <section key={section}>
              <h2 className="docs-sidebar-section">
                <Icon size={15} aria-hidden="true" /> {section}
              </h2>
              {releasedDocsIn(section).map((d) => (
                <a
                  key={d.slug}
                  href={`/docs/${d.slug}`}
                  className="docs-sidebar-link"
                  aria-current={d.slug === slug ? "page" : undefined}
                  onClick={close}
                >
                  <span>{d.title}</span>
                  <ChevronRight size={14} className="docs-sidebar-chevron" aria-hidden="true" />
                </a>
              ))}
            </section>
          );
        })}
      </nav>
      <footer className="docs-sidebar-footer">
        <nav aria-label="Sonnely links">
          <a href="/">
            Sonnely <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <a href="/console/chat">
            Console <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <a href="/status">
            Status <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
        <MotionSwitch icon />
      </footer>
    </aside>
  );
}

function CopyMarkdown({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(pageMarkdown(docAt(slug).slug));
    setCopied(true);
  };
  return (
    <button
      type="button"
      className="docs-page-action"
      onClick={() => void copy()}
      onBlur={() => setCopied(false)}
      onPointerLeave={() => setCopied(false)}
    >
      <Copy size={14} /> {copied ? "Copied" : "Copy Markdown"}
    </button>
  );
}

function SearchDocs() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchDocs(query).results.slice(0, 8), [query]);
  return (
    <div
      className="docs-search"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <Search size={14} className="docs-search-icon" />
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || results.length === 0) return;
          event.preventDefault();
          event.currentTarget.parentElement?.querySelector("a")?.focus();
        }}
        placeholder="Search"
        aria-label="Search documentation"
        aria-controls="docs-search-results"
        aria-expanded={open && query.trim() !== ""}
      />
      {query !== "" && (
        <button type="button" className="docs-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
          ×
        </button>
      )}
      {open && query.trim() !== "" && (
        <div className="docs-search-results" id="docs-search-results" role="listbox" aria-label="Documentation search results">
          {results.length === 0 && <p className="docs-search-empty">No results for “{query}”.</p>}
          {results.map((r) => (
            <a key={r.id} href={r.url} role="option" aria-selected="false" onClick={() => setOpen(false)}>
              <strong>{r.type === "page" ? r.content.split(" — ")[0] : docTitle(r.url)}</strong>
              <span>{r.content}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function docTitle(url: string): string {
  const slug = url === "/docs" ? "index" : url.replace("/docs/", "");
  return releasedDocs.find((d) => d.slug === slug)?.title ?? url;
}
