// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { SearchField } from "../../search.tsx";
import { articles, categoryIcons, readingMinutes, type Article } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";
import "./journal.css";

const topics = ["All", ...new Set(articles.map((article) => article.category))];

function topicCount(topic: string) {
  return topic === "All"
    ? articles.length
    : articles.filter((article) => article.category === topic).length;
}

export function JournalMeta({ article }: { article: Article }) {
  return (
    <span className="jrn-meta">
      <ProductIcon name={categoryIcons[article.category] ?? "Box"} size={13} aria-hidden="true" />
      {article.category} · {readingMinutes(article)} min read
    </span>
  );
}

function JournalEntry({ article, lead }: { article: Article; lead: boolean }) {
  const Title = lead ? "h2" : "h3";
  return (
    <li className={lead ? "jrn-entry jrn-lead" : "jrn-entry"}>
      <a href={"/blog/" + article.slug}>
        <span className="jrn-topic">
          <ProductIcon name={categoryIcons[article.category] ?? "Box"} size={14} aria-hidden="true" />
          {article.category}
        </span>
        <span className="jrn-entry-main">
          <Title>{article.title}</Title>
          <p>{article.summary}</p>
        </span>
        <span className="jrn-minutes">
          {readingMinutes(article)} min read
          <ArrowUpRight size={16} aria-hidden="true" />
        </span>
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
    <section className="jrn-index" id="journal-articles" aria-label="Journal articles">
      <div className="jrn-tools">
        <div className="jrn-topics" role="group" aria-label="Filter by topic">
          {topics.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === topic}
              onClick={() => setTopic(item)}
            >
              {item}
              <span className="jrn-count">{topicCount(item)}</span>
            </button>
          ))}
        </div>
        <SearchField
          ref={searchRef}
          className="jrn-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search articles"
          aria-label="Search the journal"
        />
      </div>
      {entries.length ? (
        <ul className="jrn-list" role="list" data-reveal="fade">
          {entries.map((item, index) => (
            <JournalEntry key={item.slug} article={item} lead={leading && index === 0} />
          ))}
        </ul>
      ) : (
        <div className="jrn-empty" role="status">
          <p>No articles match {term ? "“" + search.trim() + "”" : "this topic"}.</p>
          <button
            type="button"
            className="button quiet small"
            onClick={() => {
              setTopic("All");
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            Show all articles
          </button>
        </div>
      )}
    </section>
  );
}

export function JournalPage() {
  return (
    <div className="wrap jrn-page">
      <header className="jrn-hero">
        <h1>Field notes, written plainly.</h1>
        <p>Notes on how requests run, how you’re billed and what to check when something breaks.</p>
      </header>
      <JournalIndex />
    </div>
  );
}
