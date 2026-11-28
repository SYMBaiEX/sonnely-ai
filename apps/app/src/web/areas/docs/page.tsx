// spec/app/docs/index.md, "Story: Read the documentation"
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SearchField } from "../../search.tsx";
import { docAt } from "../../../../gen/app__docs.ts";
import {
  bodyLines,
  markdownUrl,
  pageMarkdown,
  parseBlocks,
  docAfter,
  docBefore,
  docs,
  docsIn,
  sections,
  searchDocs,
  tocOf,
} from "../../../docs.ts";
import "../site/appearance.ts";
import { MotionSwitch, AmbientVisualizer } from "../site/motion.tsx";
import { SiteHeader, useAmbientMotion, useTheme } from "../site/chrome.tsx";
import { Blocks } from "./blocks.tsx";

const sidebarKey = "sonnely.docs.sidebar";

function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(sidebarKey) === "collapsed";
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(sidebarKey, next ? "collapsed" : "expanded");
    } catch {
      // device-local chrome state is best-effort
    }
  };
  return [collapsed, set];
}

export function DocsPage({ slug }: { slug: string }) {
  const doc = docAt(slug);
  const lines = useMemo(() => bodyLines(slug), [slug]);
  const blocks = useMemo(() => parseBlocks(lines), [lines]);
  const toc = useMemo(() => tocOf(lines), [lines]);
  const hasDesktopToc = toc.length > (slug === "index" ? 1 : 0);
  const before = docBefore(slug);
  const after = docAfter(slug);
  const motion = useAmbientMotion();
  const theme = useTheme();
  const kind = slug === "index" ? "overview" : slug === "api" ? "api" : "guide";
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const reopen = (focusId?: string) => {
    setCollapsed(false);
    if (focusId !== undefined) {
      window.setTimeout(() => document.getElementById(focusId)?.focus(), 200);
    }
  };

  return (
    <div className="theme-root site docs-shell" data-theme={theme} data-motion={motion ? "on" : "off"} data-collapsed={collapsed ? "" : undefined}>
      <a href="#docs-page" className="skip">
        Skip to documentation
      </a>
      <div className="docs-backdrop" data-motion={motion ? "on" : "off"} aria-hidden="true">
        <div className="workspace-scene" />
        <AmbientVisualizer motion={motion} theme={theme} />
      </div>
      <SiteHeader current={slug === "index" ? "/docs" : `/docs/${slug}`} />
      <div className="docs-sidebar-pill" role="group" aria-label="Sidebar actions">
        <button type="button" aria-label="Open sidebar" onClick={() => reopen("docs-sidebar-collapse")}>
          <PanelLeftOpen size={15} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Search documentation" onClick={() => reopen("docs-search-input")}>
          <Search size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="docs-layout" data-toc={hasDesktopToc ? "" : undefined}>
        <Sidebar slug={slug} onCollapse={() => setCollapsed(true)} />
        <main id="docs-page" className="docs-main" tabIndex={-1}>
          <article className="docs-article" data-docs-page={kind}>
            <header className="docs-article-header">
              <h1>{doc.title}</h1>
              <p className="docs-article-description">{doc.description}</p>
              <div className="docs-page-actions">
                <CopyMarkdown slug={slug} />
                <a className="docs-page-action" href={markdownUrl(slug)} target="_self">
                  <FileText size={15} aria-hidden="true" /> View Markdown
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
        </main>
        {hasDesktopToc && (
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

function Sidebar({ slug, onCollapse }: { slug: string; onCollapse: () => void }) {
  const [open, setOpen] = useState(false);
  const [openSlug, setOpenSlug] = useState(slug);
  if (openSlug !== slug) {
    setOpenSlug(slug);
    setOpen(false);
  }
  const close = () => setOpen(false);
  return (
    <aside className="docs-sidebar" aria-label="Documentation sidebar" data-open={open ? "" : undefined}>
      <div className="docs-sidebar-inner">
        <div className="docs-sidebar-head">
        <div className="docs-sidebar-brandrow">
          <a href="/docs" className="docs-sidebar-brand">
            <BookOpen size={18} /> Documentation
          </a>
          <button type="button" className="docs-sidebar-collapse" id="docs-sidebar-collapse" aria-label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose size={15} aria-hidden="true" />
          </button>
        </div>
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
            <strong>{slug === "index" ? "Overview" : docAt(slug).title}</strong>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <nav className="docs-sidebar-nav" id="docs-sidebar-nav" aria-label="Documentation">
        <a href="/docs" className="docs-sidebar-link" aria-current={slug === "index" ? "page" : undefined} onClick={close}>
          <span>Overview</span>
          <ChevronRight size={14} className="docs-sidebar-chevron" aria-hidden="true" />
        </a>
        {sections.map((section) => (
          <section key={section}>
            <h2 className="docs-sidebar-section">{section}</h2>
            {docsIn(section).map((d) => (
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
        ))}
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
      </div>
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
      <Copy size={15} aria-hidden="true" /> <span aria-live="polite">{copied ? "Copied" : "Copy Markdown"}</span>
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
      <SearchField
        id="docs-search-input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || results.length === 0) return;
          event.preventDefault();
          event.currentTarget.closest(".docs-search")?.querySelector("a")?.focus();
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
  return docs.find((d) => d.slug === slug)?.title ?? url;
}
