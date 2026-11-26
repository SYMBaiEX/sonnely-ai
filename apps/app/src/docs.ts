// spec/app/docs/index.md — the catalog the pages, the search endpoint and the
// markdown feeds all read.
import { apiEndpoints, bodyAt, docAt, docs, docsIn, isDoc, sections } from "../gen/app__docs.ts";
import { docReleased, publicHrefReleased } from "./feature-availability.ts";

export const apiOrigin = "https://sonnely.com";
export const apiBasePath = "/api/sonnely/v1";

/** Quint strings hold no escapes: a body writes `§` for a backslash and `‖` for a double quote. */
export const decode = (line: string): string => line.replaceAll("§", "\\").replaceAll("‖", '"');

/** A doc's markdown lines, decoded. */
export const bodyLines = (slug: string): string[] => bodyAt(slug).map(decode);

export const releasedDocs = docs.filter((doc) => docReleased(doc.slug));
export const releasedSections = sections.filter((section) =>
  releasedDocs.some((doc) => doc.section === section),
);

export function releasedDocsIn(section: string) {
  return docsIn(section).filter((doc) => docReleased(doc.slug));
}

export function releasedSlugBefore(slug: string): string {
  const index = releasedDocs.findIndex((doc) => doc.slug === slug);
  return index > 0 ? releasedDocs[index - 1].slug : "";
}

export function releasedSlugAfter(slug: string): string {
  const index = releasedDocs.findIndex((doc) => doc.slug === slug);
  return index >= 0 && index + 1 < releasedDocs.length ? releasedDocs[index + 1].slug : "";
}

export type Block =
  | { kind: "md"; lines: string[] }
  | { kind: "box"; box: string; label?: string; children: Block[] }
  | { kind: "card"; icon: string; title: string; href: string; description: string; primary: boolean }
  | { kind: "group"; icon: string; id: string; title: string; children: Block[] }
  | { kind: "link"; id: string; href: string; title: string }
  | { kind: "steps"; children: Block[] }
  | { kind: "step"; children: Block[] }
  | { kind: "tabs"; children: Block[] }
  | { kind: "tab"; label: string; children: Block[] }
  | { kind: "apiref" };

const DIRECTIVE = /^@([a-z]+)(?:\s+(\{.*\}))?\s*$/;
const PUSH: Record<string, true> = { box: true, group: true, steps: true, step: true, tabs: true, tab: true };

/** A body as nested blocks: `@`-directives become structure, the rest markdown. */
export function parseBlocks(lines: string[]): Block[] {
  const root: Block[] = [];
  const stack: { children: Block[] }[] = [{ children: root }];
  const top = () => stack[stack.length - 1];
  const emit = (line: string) => {
    const last = top().children[top().children.length - 1];
    if (last && last.kind === "md") last.lines.push(line);
    else top().children.push({ kind: "md", lines: [line] });
  };
  for (const line of lines) {
    const m = DIRECTIVE.exec(line);
    if (!m) {
      emit(line);
      continue;
    }
    const data = m[2] ? (JSON.parse(m[2]) as Record<string, unknown>) : {};
    switch (m[1]) {
      case "end":
        stack.pop();
        break;
      case "card":
        top().children.push({
          kind: "card",
          icon: String(data.icon ?? ""),
          title: String(data.title ?? ""),
          href: String(data.href ?? ""),
          description: String(data.description ?? ""),
          primary: data.primary === true,
        });
        break;
      case "link":
        top().children.push({
          kind: "link",
          id: String(data.id ?? ""),
          href: String(data.href ?? ""),
          title: String(data.title ?? ""),
        });
        break;
      case "apiref":
        top().children.push({ kind: "apiref" });
        break;
      default: {
        if (!PUSH[m[1]]) {
          emit(line);
          break;
        }
        const block: Block =
          m[1] === "box"
            ? { kind: "box", box: String(data.kind ?? ""), label: data.label === undefined ? undefined : String(data.label), children: [] }
            : m[1] === "group"
              ? { kind: "group", icon: String(data.icon ?? ""), id: String(data.id ?? ""), title: String(data.title ?? ""), children: [] }
              : m[1] === "tab"
                ? { kind: "tab", label: String(data.label ?? ""), children: [] }
                : ({ kind: m[1], children: [] } as Block);
        top().children.push(block);
        stack.push(block as { children: Block[] });
      }
    }
  }
  return root;
}

export function releasedBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block): Block[] => {
    switch (block.kind) {
      case "card":
      case "link":
        return publicHrefReleased(block.href) ? [block] : [];
      case "box":
        return [{ ...block, children: releasedBlocks(block.children) }];
      case "group": {
        const children = releasedBlocks(block.children);
        return children.length > 0 ? [{ ...block, children }] : [];
      }
      case "steps":
      case "step":
      case "tabs":
      case "tab":
        return [{ ...block, children: releasedBlocks(block.children) }];
      default:
        return [block];
    }
  });
}

// ---- The same body as plain markdown, for the feeds ----

function* markdownOfBlocks(blocks: Block[]): Generator<string> {
  for (const block of blocks) {
    switch (block.kind) {
      case "md":
        yield* block.lines;
        break;
      case "card":
        yield `- [**${block.title}**](${block.href})${block.description ? ` — ${block.description}` : ""}`;
        break;
      case "group":
        yield "";
        yield `### ${block.title}`;
        yield "";
        yield* markdownOfBlocks(block.children);
        break;
      case "link":
        yield `- [${block.title}](${block.href})`;
        break;
      case "tab":
        yield "";
        yield `**${block.label}**`;
        yield "";
        yield* markdownOfBlocks(block.children);
        break;
      case "apiref":
        yield "";
        yield `**Base URL:** \`${apiOrigin + apiBasePath}\``;
        yield "";
        yield "| Method | Path | Description |";
        yield "| --- | --- | --- |";
        for (const e of apiEndpoints) yield `| \`${e.method}\` | \`${e.path}\` | ${e.description} |`;
        yield "";
        break;
      default:
        yield* markdownOfBlocks(block.children);
    }
  }
}

/** The body's markdown, with the directives written out as markdown. */
export function markdownOf(slug: string): string[] {
  const out = [...markdownOfBlocks(releasedBlocks(parseBlocks(bodyLines(slug))))];
  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/** A doc's page as one markdown document, as `/llms.mdx/docs/<slug>/content.md` serves it. */
export function pageMarkdown(slug: string): string {
  const doc = docAt(slug);
  return `# ${doc.title}\n\n${markdownOf(slug).join("\n")}`;
}

/** A doc's canonical markdown link. */
export function markdownUrl(slug: string): string {
  return slug === "index" ? "/llms.mdx/docs/content.md" : `/llms.mdx/docs/${slug}/content.md`;
}

/** `/llms.txt`: one line per guide. */
export function llmsIndex(origin = apiOrigin): string {
  const lines = releasedDocs.map((d) => `- [${d.title}](${origin}${markdownUrl(d.slug)}): ${d.description}`);
  return ["# Sonnely documentation", "", ...lines, ""].join("\n");
}

/** `/llms-full.txt`: the whole catalog as one document. */
export function llmsFull(): string {
  return releasedDocs.map((d) => `# ${d.title}\n\n${markdownOf(d.slug).join("\n")}`).join("\n\n---\n\n");
}

export interface SearchResult {
  id: string;
  url: string;
  type: "page" | "text";
  content: string;
}

/** The guides whose title, description or markdown mentions the query, pages first. */
export function searchDocs(query: string): { success: boolean; results: SearchResult[] } {
  const needle = query.trim().toLowerCase();
  if (needle === "") return { success: true, results: [] };
  const results: SearchResult[] = [];
  for (const doc of releasedDocs) {
    const url = doc.slug === "index" ? "/docs" : `/docs/${doc.slug}`;
    if (doc.title.toLowerCase().includes(needle) || doc.description.toLowerCase().includes(needle)) {
      results.push({ id: url, url, type: "page", content: `${doc.title} — ${doc.description}` });
      continue;
    }
    const hit = markdownOf(doc.slug).find((line) => line.toLowerCase().includes(needle));
    if (hit !== undefined) results.push({ id: url, url, type: "text", content: hit.trim() });
  }
  return { success: true, results };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/** Heading lines a table of contents lists: the id slugify gives `h2`/`h3`. */
export function tocOf(lines: string[]): { id: string; title: string; depth: 2 | 3 }[] {
  const out: { id: string; title: string; depth: 2 | 3 }[] = [];
  let fence = "";
  for (const line of lines) {
    if (/^```/.test(line)) fence = fence === "" ? "```" : "";
    else if (fence === "") {
      const m = /^(#{2,3})\s+(.+)$/.exec(line);
      if (m) out.push({ id: slugify(m[2]), title: m[2], depth: m[1].length as 2 | 3 });
    }
  }
  return out;
}
export { docs, docAt, isDoc };
