// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { ReaderNavigation, SiteLead } from "./chrome.tsx";
import { articles } from "./journal.ts";
import { panel, readerBody, readerGrid, textLink, wrap } from "./ui.ts";

function sectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function PostPage({ slug }: { slug: string }) {
  const article = articles.find((item) => item.slug === slug);
  if (!article) return null;
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
    <article className={wrap + " pt-6"}>
      <SiteLead
        title={article.title}
        description={article.summary}
        status={article.category}
        back={["/#journal-articles", "Field notes"]}
      />
      <div className={sections.length ? readerGrid : undefined}>
        {sections.length > 0 && <ReaderNavigation sections={sections} />}
        <div className={panel + " " + readerBody}>
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
            <a className={textLink} href={article.related[0]}>
              {article.related[1]} <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          <aside className="mt-8 grid gap-2.5 border-t border-border pt-6" aria-label="More from the journal">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">Read next</h2>
            {related.map((entry) => (
              <a className={textLink} href={"/blog/" + entry.slug} key={entry.slug}>
                {entry.title} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
          </aside>
        </div>
      </div>
    </article>
  );
}
