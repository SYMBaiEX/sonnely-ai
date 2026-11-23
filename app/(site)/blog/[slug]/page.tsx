import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/lib/journal";
import { ReaderNavigation, SiteLead } from "@/components/site-lead";
import { ArrowUpRight } from "lucide-react";

function sectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateStaticParams() {
  return articles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articles.find((item) => item.slug === slug);
  return article
    ? {
        title: article.title,
        description: article.summary,
        alternates: { canonical: "/blog/" + article.slug },
      }
    : {};
}

export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articles.find((item) => item.slug === slug);
  if (!article) notFound();
  const related = articles
    .filter((entry) => entry.slug !== article.slug)
    .sort((a, b) => Number(b.category === article.category) - Number(a.category === article.category))
    .slice(0, 2);
  const sections = article.body.flatMap((item) =>
    typeof item === "string" ? [] : [[sectionId(item.heading), item.heading] as const],
  );
  return (
    <article className="wrap inner-page market-page article-page">
      <SiteLead
        title={article.title}
        description={article.summary}
        status={article.category}
        back={["/blog", "Field notes"]}
      />
      <div className={sections.length ? "reader-grid" : "reader-single"}>
        {sections.length > 0 && <ReaderNavigation sections={sections} />}
        <div className="panel reader-body">
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
            <Link className="text-link" href={article.related[0]}>
              {article.related[1]} <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          )}
          <aside className="journal-next" aria-label="More from the journal">
            <h2>Read next</h2>
            {related.map((entry) => (
              <Link className="text-link" href={"/blog/" + entry.slug} key={entry.slug}>
                {entry.title} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </aside>
        </div>
      </div>
    </article>
  );
}
