import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import mdxComponents from "fumadocs-ui/mdx";
import { docsSource } from "@/lib/docs-source";

type Props = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata({ params }: Props) {
  const page = docsSource.getPage((await params).slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
  };
}

export default async function DocumentationPage({ params }: Props) {
  const page = docsSource.getPage((await params).slug);
  if (!page) notFound();
  const Content = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Content components={mdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}
