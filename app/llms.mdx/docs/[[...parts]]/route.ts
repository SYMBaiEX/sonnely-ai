import { docsSource } from "@/lib/docs-source";

type Props = { params: Promise<{ parts?: string[] }> };

export function generateStaticParams() {
  return docsSource.getPages().map(({ slugs }) => ({ parts: [...slugs, "content.md"] }));
}

export async function GET(_request: Request, { params }: Props) {
  const parts = (await params).parts ?? [];
  const page = parts.at(-1) === "content.md" ? docsSource.getPage(parts.slice(0, -1)) : undefined;
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(`# ${page.data.title}\n\n${await page.data.getText("processed")}`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
