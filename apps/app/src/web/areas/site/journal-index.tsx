// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { SearchField } from "../../search.tsx";
import { articles, categoryIcons, type Article } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";
import "./journal.css";

const topics = ["All", ...new Set(articles.map((article) => article.category))];

export function JournalEntry({ article, lead = false }: { article: Article; lead?: boolean }) {
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
        <ArrowUpRight className="jrn-arrow" size={16} aria-hidden="true" />
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
            </button>
          ))}
        </div>
        <SearchField
          ref={searchRef}
          className="jrn-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search articles"
          aria-label="Search articles"
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
          <p>
            No {topic === "All" ? "" : topic + " "}articles match “{search.trim()}”.
          </p>
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
