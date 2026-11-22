import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import mdxComponents from "fumadocs-ui/mdx";
import { apiOrigin } from "@/lib/api-contract";
import { docsSource } from "@/lib/docs-source";

const DocsLink = mdxComponents.a;
const components = {
  ...mdxComponents,
  a({ href, ...props }: ComponentProps<"a">) {
    if (href?.startsWith("/") && !href.startsWith("//") && !/^\/docs(?:[\/#?]|$)/.test(href)) {
      // The console and marketing routes live on the apex, including when docs are open on the subdomain.
      return <a {...props} href={apiOrigin + href} />;
    }
    return <DocsLink {...props} href={href} />;
  },
};

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
        <Content components={components} />
      </DocsBody>
    </DocsPage>
  );
}
