import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/lib/journal";
import { Scene } from "@/components/scene";

export function generateStaticParams() {
  return articles.map(({ slug }) => ({ slug }));
}

export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articles.find((item) => item.slug === slug);
  if (!article) notFound();
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
      {article.body.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </article>
  );
}
