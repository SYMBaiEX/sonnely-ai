import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
} from "fumadocs-ui/layouts/docs/page";
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
  const kind = page.url === "/docs" ? "overview" : page.url === "/docs/api" ? "api" : "guide";
  const markdownUrl = page.url === "/docs" ? "/llms.mdx/docs/content.md" : page.url + ".md";
  return (
    <DocsPage
      tabIndex={-1}
      toc={page.data.toc}
      tableOfContent={{ style: "block" }}
      tableOfContentPopover={{ style: "block" }}
    >
      <header className="docs-article-header" data-docs-page={kind}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <div className="docs-page-actions">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <a href={markdownUrl}>View Markdown</a>
        </div>
      </header>
      <DocsBody className={kind === "guide" ? "docs-guide" : undefined}>
        <Content components={components} />
      </DocsBody>
    </DocsPage>
  );
}
