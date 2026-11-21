import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/lib/journal";
import { Scene } from "@/components/scene";

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
  return (
    <article className="wrap inner-page prose">
      <header className="page-lead article-lead">
        <Scene />
        <Link href="/blog" className="text-link">
          ← Field notes
        </Link>
        <p className="eyebrow">{article.category}</p>
        <h1>{article.title}</h1>
        <p className="lead-text">{article.summary}</p>
      </header>
      <div className="journal-reading">
        {article.body.map((item) =>
          typeof item === "string" ? (
            <p key={item}>{item}</p>
          ) : (
            <section key={item.heading}>
              <h2>{item.heading}</h2>
              {item.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ),
        )}
        {article.related && (
          <Link className="text-link" href={article.related[0]}>
            {article.related[1]} ↗
          </Link>
        )}
        <aside className="journal-next" aria-label="More from the journal">
          <h2>Read next</h2>
          {related.map((entry) => (
            <Link className="text-link" href={"/blog/" + entry.slug} key={entry.slug}>
              {entry.title} ↗
            </Link>
          ))}
        </aside>
      </div>
    </article>
  );
}
