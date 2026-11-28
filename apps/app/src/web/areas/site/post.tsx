// spec/app/site/index.md, "Story: Check the service status"
import { NotFound } from "./notfound.tsx";
import { ArrowLeft, ArrowUpRight, List } from "lucide-react";
import { articles, readingMinutes } from "./journal.ts";
import { JournalEntry } from "./journal-index.tsx";

function sectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function PostPage({ slug }: { slug: string }) {
  const article = articles.find((item) => item.slug === slug);
  if (!article) return <NotFound />;
  const related = articles
    .filter((entry) => entry.slug !== article.slug)
    .sort(
      (a, b) => Number(b.category === article.category) - Number(a.category === article.category),
    )
    .slice(0, 2);
  const sections = article.body.flatMap((item) =>
    typeof item === "string" ? [] : ([[sectionId(item.heading), item.heading]] as const),
  );
  return (
    <article className="wrap jrn-post">
      <nav className="jrn-return" aria-label="Journal navigation">
        <a className="text-link" href="/blog"><ArrowLeft size={14} aria-hidden="true" /> Journal</a>
      </nav>
      <header className="jrn-post-hero">
        <h1>{article.title}</h1>
        <p>{article.summary}</p>
        <p className="jrn-post-meta">
          {article.category} · {readingMinutes(article)} min read
        </p>
      </header>
      <div className="jrn-post-layout">
        <div className="jrn-prose">
          {sections.length > 1 && (
            <details className="jrn-minitoc">
              <summary>
                <List size={15} aria-hidden="true" /> On this page
              </summary>
              <nav aria-label="On this page">
                {sections.map(([id, heading]) => (
                  <a key={id} href={"#" + id}>{heading}</a>
                ))}
              </nav>
            </details>
          )}
          {article.body.map((item) =>
            typeof item === "string" ? (
              <p key={item}>{item}</p>
            ) : (
              <section key={item.heading}>
                <h2 id={sectionId(item.heading)}>{item.heading}</h2>
                {item.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </section>
            ),
          )}
          {article.related && (
            <a className="jrn-reflink" href={article.related[0]}>
              {article.related[1]} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          <footer className="jrn-more">
            <h2>Read next</h2>
            <ul className="jrn-list" role="list">
              {related.map((entry) => (
                <JournalEntry key={entry.slug} article={entry} />
              ))}
            </ul>
          </footer>
        </div>
        {sections.length > 0 && (
          <aside className="jrn-toc" aria-label="On this page">
            <p className="jrn-toc-title">On this page</p>
            <nav>
              {sections.map(([id, heading]) => (
                <a key={id} href={"#" + id}>{heading}</a>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </article>
  );
}
