// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button, cn } from "@repo/ui";
import { SearchField } from "../../search.tsx";
import { articles, categoryIcons, type Article } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";

const topics = ["All", ...new Set(articles.map((article) => article.category))];
const pageWidth = "mx-auto w-full max-w-[1320px] px-4 md:px-8 xl:px-12";

export function JournalEntry({ article, lead = false, compact = false }: { article: Article; lead?: boolean; compact?: boolean }) {
  const Title = lead ? "h2" : "h3";
  return (
    <li className="border-b border-border">
      <a
        href={"/blog/" + article.slug}
        className={cn(
          "group -mx-2.5 grid gap-2 rounded-xl px-2.5 py-4 text-foreground no-underline transition-colors hover:bg-accent/55 focus-visible:bg-accent/55 focus-visible:outline-none md:-mx-3.5 md:px-3.5",
          compact ? "md:grid-cols-[minmax(0,1fr)_auto]" : "md:grid-cols-[10.5rem_minmax(0,1fr)_auto] md:items-baseline md:gap-x-10",
          lead && "py-6 md:py-8",
        )}
      >
        {!compact && (
          <span className="flex items-center gap-2 text-meta font-medium text-muted-foreground">
            <span className="shrink-0 translate-y-0.5 text-primary"><ProductIcon name={categoryIcons[article.category] ?? "Box"} size={14} aria-hidden="true" /></span>
            {article.category}
          </span>
        )}
        <span className={cn("grid min-w-0 gap-1.5", compact && "col-span-2 md:col-span-1", lead && "gap-2")}>
          <Title className="text-heading font-strong leading-heading tracking-heading text-balance transition-colors group-hover:text-primary group-focus-visible:text-primary">
            {article.title}
          </Title>
          <p className={cn("max-w-[64ch] text-body leading-body text-muted-foreground text-pretty", compact && "text-ui", lead && "text-lead leading-lead")}>
            {article.summary}
          </p>
        </span>
        <ArrowUpRight className="self-center text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary group-focus-visible:text-primary" size={16} aria-hidden="true" />
      </a>
    </li>
  );
}

export function JournalIndex() {
  const [topic, setTopic] = useState("All");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const term = search.trim().toLowerCase();
  const entries = articles.filter(
    (article) =>
      (topic === "All" || article.category === topic) &&
      (article.title + " " + article.summary + " " + article.category)
        .toLowerCase()
        .includes(term),
  );
  const leading = topic === "All" && !term;
  return (
    <section className="grid gap-3.5" id="journal-articles" aria-label="Journal articles">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch">
        <div className="flex min-w-0 flex-wrap gap-1 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]" role="group" aria-label="Filter by topic">
          {topics.map((item) => (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={item === topic}
              className={cn(
                "shrink-0 border font-medium",
                item === topic
                  ? "border-border bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTopic(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <SearchField
          ref={searchRef}
          className="w-full sm:w-[300px]"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search articles"
          aria-label="Search articles"
        />
      </div>
      {entries.length ? (
        <ul className="grid border-t border-foreground" role="list" data-reveal="fade">
          {entries.map((item, index) => (
            <JournalEntry key={item.slug} article={item} lead={leading && index === 0} />
          ))}
        </ul>
      ) : (
        <div className="grid justify-items-start gap-3.5 border-t border-foreground py-8 text-body text-muted-foreground" role="status">
          <p>
            No {topic === "All" ? "" : topic + " "}articles match “{search.trim()}”.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTopic("All");
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            Show all articles
          </Button>
        </div>
      )}
    </section>
  );
}

export function JournalPage() {
  return (
    <div className={`${pageWidth} py-8 md:py-14`}>
      <header className="mb-8 grid gap-3 md:mb-9">
        <h1 className="max-w-[14ch] text-title font-strong leading-tight tracking-title text-balance">
          Field notes, written plainly.
        </h1>
        <p className="max-w-[46ch] text-lead leading-lead text-muted-foreground text-pretty">
          Notes on how requests run, how you’re billed and what to check when something breaks.
        </p>
      </header>
      <JournalIndex />
    </div>
  );
}
