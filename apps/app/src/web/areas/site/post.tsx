// spec/app/site/index.md, "Story: Check the service status"
import { NotFound } from "./notfound.tsx";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { articles, categoryIcons, readingMinutes } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";

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
    <article className="wrap cor-page cor-post-page">
      <nav className="cor-post-return" aria-label="Journal navigation">
        <a href="/blog"><ArrowLeft size={14} aria-hidden="true" /> Correspondence archive</a>
      </nav>
      <header className="cor-post-head">
        <span className="cor-dispatch-meta">
          <ProductIcon name={categoryIcons[article.category] ?? "Box"} size={15} />
          {article.category} · {readingMinutes(article)} min read
        </span>
        <h1>{article.title}</h1>
        <p>{article.summary}</p>
      </header>
      <div className={sections.length ? "cor-post-layout" : "cor-post-layout cor-post-layout-single"}>
        {sections.length > 0 && (
          <aside className="cor-contents" aria-label="Letter contents">
            <span>Contents</span>
            <ol>
              {sections.map(([id, heading]) => (
                <li key={id}><a href={"#" + id}>{heading}</a></li>
              ))}
            </ol>
          </aside>
        )}
        <div className="cor-letter cor-post-letter">
          <div className="cor-letter-head">
            <span>Sonnely field notes</span>
            <span>{article.category} desk</span>
          </div>
          <div className="cor-letter-body">
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
              <a className="cor-letter-reference" href={article.related[0]}>
                {article.related[1]} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
            <footer className="cor-letter-signoff">
              <span>Written from the {article.category.toLowerCase()} desk</span>
              <strong>Sonnely</strong>
            </footer>
            <aside className="cor-next" aria-label="More from the journal">
              <span>Next correspondence</span>
              {related.map((entry) => (
                <a href={"/blog/" + entry.slug} key={entry.slug}>
                  <small>{entry.category} · {readingMinutes(entry)} min</small>
                  <strong>{entry.title}</strong>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              ))}
            </aside>
          </div>
        </div>
      </div>
    </article>
  );
}
