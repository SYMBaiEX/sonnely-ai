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
import { flushSync } from "react-dom";
import { Button } from "@repo/ui";
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
import { SiteHeader } from "../site/chrome.tsx";
import { useTheme } from "../../shell/theme.tsx";
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
  const theme = useTheme();
  const kind = slug === "index" ? "overview" : slug === "api" ? "api" : "guide";
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const reopen = (focusId: string) => {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- focus can only land in the sidebar once its expanded state is committed, and activation is synchronous
    flushSync(() => setCollapsed(false));
    document.getElementById(focusId)?.focus();
  };

  return (
    <div className="theme-root site docs-shell" data-theme={theme} data-collapsed={collapsed ? "" : undefined}>
      <a href="#docs-page" className="skip">
        Skip to documentation
      </a>
      <SiteHeader current={slug === "index" ? "/docs" : `/docs/${slug}`} />
      <div className="docs-sidebar-pill" role="group" aria-label="Sidebar actions">
        <Button type="button" variant="ghost" size="icon" aria-label="Open sidebar" onClick={() => reopen("docs-sidebar-collapse")}>
          <PanelLeftOpen size={15} aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Search documentation" onClick={() => reopen("docs-search-input")}>
          <Search size={15} aria-hidden="true" />
        </Button>
      </div>
      <div className="docs-layout" data-toc={hasDesktopToc ? "" : undefined}>
        <Sidebar slug={slug} onCollapse={() => setCollapsed(true)} />
        <main id="docs-page" className="docs-main" tabIndex={-1}>
          <article className="docs-article" data-docs-page={kind}>
            <header className="docs-article-header">
              <h1>{doc.title}</h1>
              <p className="docs-article-description">{doc.description}</p>
              <div className="docs-page-actions" role="group" aria-label="Document Markdown">
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
                </a>
              )}
              {after === "" ? (
                <span />
              ) : (
                <a className="docs-pager-card" data-direction="next" href={`/docs/${after}`}>
                  <span className="docs-pager-label">Next →</span>
                  <strong>{docAt(after).title}</strong>
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
          <Button type="button" variant="ghost" size="icon" className="docs-sidebar-collapse" id="docs-sidebar-collapse" aria-label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose size={15} aria-hidden="true" />
          </Button>
        </div>
        <SearchDocs />
        <Button
          type="button"
          variant="ghost"
          className="docs-nav-toggle h-auto whitespace-normal"
          aria-expanded={open}
          aria-controls="docs-sidebar-nav"
          onClick={() => setOpen(!open)}
        >
          <span>Browse guides</span>
          <ChevronDown size={16} aria-hidden="true" />
        </Button>
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="docs-page-action"
      onClick={() => void copy()}
      onBlur={() => setCopied(false)}
      onPointerLeave={() => setCopied(false)}
    >
      <Copy size={15} aria-hidden="true" /> <span aria-live="polite">{copied ? "Copied" : "Copy Markdown"}</span>
    </Button>
  );
}

function SearchDocs() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const results = useMemo(() => searchDocs(query).results.slice(0, 8), [query]);
  const expanded = open && query.trim() !== "";
  const activeId = expanded && active >= 0 && active < results.length ? `docs-search-option-${active}` : undefined;
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
        role="combobox"
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (results.length === 0) return;
            event.preventDefault();
            setOpen(true);
            const forward = event.key === "ArrowDown";
            const next = active < 0 ? (forward ? 0 : results.length - 1) : (active + (forward ? 1 : -1) + results.length) % results.length;
            setActive(next);
            document.getElementById(`docs-search-option-${next}`)?.scrollIntoView({ block: "nearest" });
            return;
          }
          if (event.key === "Enter" && active >= 0 && active < results.length) {
            event.preventDefault();
            document.getElementById(`docs-search-option-${active}`)?.click();
          }
        }}
        placeholder="Search guides"
        aria-label="Search documentation"
        aria-controls="docs-search-results"
        aria-expanded={expanded}
        aria-activedescendant={activeId}
      />
      {query !== "" && (
        <Button type="button" variant="ghost" size="icon" className="docs-search-clear" aria-label="Clear search" onClick={() => { setQuery(""); setActive(-1); }}>
          ×
        </Button>
      )}
      {expanded && (
        <div className="docs-search-results" id="docs-search-results" role="listbox" aria-label="Documentation search results">
          {results.length === 0 && <p className="docs-search-empty" role="status">No results for “{query}”. Try a guide title or a shorter term.</p>}
          {results.map((r, index) => {
            const doc = searchResultDoc(r.url);
            return (
              <a
                key={r.id}
                id={`docs-search-option-${index}`}
                href={r.url}
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                data-active={index === active ? "" : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => setOpen(false)}
              >
                <strong>{doc?.title ?? r.url}</strong>
                <span>{r.type === "page" ? (doc?.description ?? r.content) : r.content}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function searchResultDoc(url: string) {
  const slug = url === "/docs" ? "index" : url.replace("/docs/", "");
  return docs.find((d) => d.slug === slug);
}
