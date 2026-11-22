import { apiOrigin } from "@/lib/api-contract";
import { docsSource } from "@/lib/docs-source";

export const dynamic = "force-static";

export function GET() {
  const pages = docsSource.getPages().map(({ data, url }) => {
    const link = apiOrigin + (url === "/docs" ? "/llms.mdx/docs/content.md" : url + ".md");
    return `- [${data.title}](${link}): ${data.description ?? ""}`;
  });
  return new Response(["# Sonnely documentation", "", ...pages, ""].join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
