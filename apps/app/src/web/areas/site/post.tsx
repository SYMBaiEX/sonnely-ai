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

const articleWidth = "mx-auto w-full max-w-[34rem]";
const tocLink = "rounded-md px-2 py-1 text-meta leading-micro text-muted-foreground no-underline hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none";

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
    <article className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-16 md:px-8 md:pt-12 md:pb-24 xl:px-12">
      <nav className={`${articleWidth} mb-4`} aria-label="Journal navigation">
        <a className="inline-flex min-h-11 items-center gap-1.5 text-ui font-medium text-muted-foreground no-underline hover:text-primary focus-visible:text-primary focus-visible:outline-none" href="/blog">
          <ArrowLeft size={14} aria-hidden="true" /> Journal
        </a>
      </nav>
      <header className={`${articleWidth} mb-8 grid justify-items-start gap-3.5 md:mb-11`}>
        <h1 className="max-w-[18ch] text-title font-strong leading-tight tracking-title text-balance">
          {article.title}
        </h1>
        <p className="max-w-[64ch] text-lead leading-lead text-muted-foreground text-pretty">{article.summary}</p>
        <p className="text-ui text-muted-foreground">
          {article.category} · {readingMinutes(article)} min read
        </p>
      </header>
      <div className="grid items-start justify-center gap-x-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)_minmax(0,1fr)]">
        <div className="min-w-0 max-lg:mx-auto max-lg:w-full max-lg:max-w-[620px] lg:col-start-2">
          {sections.length > 1 && (
            <details className="mb-5 rounded-xl border border-border bg-card/90 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2 text-ui font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <List size={15} aria-hidden="true" className="text-primary" /> On this page
              </summary>
              <nav className="grid gap-0.5 border-t border-border px-2 pt-1 pb-2.5" aria-label="On this page">
                {sections.map(([id, heading]) => (
                  <a key={id} href={"#" + id} className={tocLink}>{heading}</a>
                ))}
              </nav>
            </details>
          )}
          {article.body.map((item) =>
            typeof item === "string" ? (
              <p key={item} className="my-3 text-body leading-body text-foreground/85 text-pretty">{item}</p>
            ) : (
              <section key={item.heading}>
                <h2 id={sectionId(item.heading)} className="mt-8 mb-3 scroll-mt-28 text-heading font-strong leading-heading tracking-heading text-balance">
                  {item.heading}
                </h2>
                {item.paragraphs.map((text) => (
                  <p key={text} className="my-3 text-body leading-body text-foreground/85 text-pretty">{text}</p>
                ))}
              </section>
            ),
          )}
          {article.related && (
            <a className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-body font-medium text-primary no-underline hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:outline-none" href={article.related[0]}>
              {article.related[1]} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          <footer className="mt-12">
            <h2 className="mb-2 text-heading font-strong leading-heading tracking-heading">Read next</h2>
            <ul className="grid border-t border-foreground" role="list">
              {related.map((entry) => (
                <JournalEntry key={entry.slug} article={entry} compact />
              ))}
            </ul>
          </footer>
        </div>
        {sections.length > 0 && (
          <aside className="sticky top-[calc(var(--site-header-height)+1.5rem)] col-start-3 hidden max-w-[200px] text-meta max-lg:hidden lg:block" aria-label="On this page">
            <p className="mb-2.5 px-2 font-medium text-foreground">On this page</p>
            <nav className="grid gap-1">
              {sections.map(([id, heading]) => (
                <a key={id} href={"#" + id} className={tocLink}>{heading}</a>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </article>
  );
}
