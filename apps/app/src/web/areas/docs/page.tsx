// spec/app/docs/index.md, "Story: Read the documentation" — a guide's page:
// top navigation, a sidebar of sections, the rendered body, a table of
// contents, and links to the neighbors.
import { BookOpen, Copy, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { docAt, docs, docsIn, sections, slugAfter, slugBefore } from "../../../../gen/app__docs.ts";
import { bodyLines, markdownUrl, parseBlocks, searchDocs, tocOf } from "../../../docs.ts";
import "../site/appearance.ts";
import { Blocks } from "./blocks.tsx";

export function DocsPage({ slug }: { slug: string }) {
  const doc = docAt(slug);
  const lines = useMemo(() => bodyLines(slug), [slug]);
  const blocks = useMemo(() => parseBlocks(lines), [lines]);
  const toc = useMemo(() => tocOf(lines), [lines]);
  const before = slugBefore(slug);
  const after = slugAfter(slug);
  return (
    <div className="docs-shell">
      <a href="#docs-page" className="docs-skip">
        Skip to documentation
      </a>
      <header className="docs-topnav">
        <a href="/" className="docs-topnav-brand">
          Sonnely
        </a>
        <nav className="docs-topnav-links" aria-label="Site">
          <a href="/inference">Inference</a>
          <a href="/models">Models</a>
          <a href="/docs" aria-current="page">
            Docs
          </a>
          <a href="/console/chat">Console</a>
        </nav>
        <SearchDocs />
      </header>
      <div className="docs-layout">
        <Sidebar slug={slug} />
        <main id="docs-page" className="docs-main">
          <article className="docs-article">
            <header className="docs-article-header">
              <h1>{doc.title}</h1>
              <p className="docs-article-description">{doc.description}</p>
              <div className="docs-page-actions">
                <CopyMarkdown slug={slug} />
                <a className="docs-page-action" href={markdownUrl(slug)} download={`${slug === "index" ? "docs" : slug}.md`}>
                  <FileText size={14} /> Download Markdown
                </a>
              </div>
            </header>
            <Blocks blocks={blocks} />
            <footer className="docs-prev-next">
              {before === "" ? <span /> : <a href={`/docs${before === "index" ? "" : `/${before}`}`}>← {docAt(before).title}</a>}
              {after === "" ? <span /> : <a href={`/docs/${after}`}>{docAt(after).title} →</a>}
            </footer>
          </article>
        </main>
        {toc.length > 0 && (
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
  return (
    <aside className="docs-sidebar">
      <a href="/docs" className="docs-sidebar-brand">
        <BookOpen size={16} /> Documentation
      </a>
      <nav className="docs-sidebar-nav" aria-label="Documentation">
        <a href="/docs" aria-current={slug === "index" ? "page" : undefined}>
          Overview
        </a>
        {sections.map((section) => (
          <section key={section}>
            <h2>{section}</h2>
            {docsIn(section).map((d) => (
              <a key={d.slug} href={`/docs/${d.slug}`} aria-current={d.slug === slug ? "page" : undefined}>
                {d.title}
              </a>
            ))}
          </section>
        ))}
      </nav>
      <footer className="docs-sidebar-footer">
        <a href="/">Sonnely</a>
        <a href="/console/chat">Console</a>
        <a href="https://status.sonnely.com">Status</a>
      </footer>
    </aside>
  );
}

function CopyMarkdown({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const doc = docAt(slug);
    const { pageMarkdown } = await import("../../../docs.ts");
    await navigator.clipboard.writeText(pageMarkdown(doc.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className="docs-page-action" onClick={() => void copy()}>
      <Copy size={14} /> {copied ? "Copied" : "Copy Markdown"}
    </button>
  );
}

function SearchDocs() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchDocs(query).results.slice(0, 8), [query]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="docs-search" ref={box}>
      <Search size={14} className="docs-search-icon" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search documentation"
        aria-label="Search documentation"
      />
      {open && query.trim() !== "" && (
        <div className="docs-search-results" role="listbox">
          {results.length === 0 && <p className="docs-search-empty">No results for “{query}”.</p>}
          {results.map((r) => (
            <a key={r.id} href={r.url} onClick={() => setOpen(false)}>
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
