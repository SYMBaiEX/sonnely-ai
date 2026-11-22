import { docsSource } from "@/lib/docs-source";

export const dynamic = "force-static";

export async function GET() {
  const pages = await Promise.all(
    docsSource.getPages().map(async ({ data }) => `# ${data.title}\n\n${await data.getText("processed")}`),
  );
  return new Response(pages.join("\n\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
