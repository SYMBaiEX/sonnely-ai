// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { SearchField } from "../../search.tsx";
import { articles, categoryIcons, readingMinutes, type Article } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";
import "./journal.css";

const topics = ["All", ...new Set(articles.map((article) => article.category))];

export function JournalMeta({ article }: { article: Article }) {
  return (
    <span className="jrn-meta">
      <ProductIcon name={categoryIcons[article.category] ?? "Box"} size={13} aria-hidden="true" />
      {article.category} · {readingMinutes(article)} min read
    </span>
  );
}

export function JournalIndex() {
  const [topic, setTopic] = useState("All");
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const entries = articles.filter(
    (article) =>
      (topic === "All" || article.category === topic) &&
      (article.title + " " + article.summary + " " + article.category)
        .toLowerCase()
        .includes(term),
  );
  const featured = topic === "All" && !term ? entries[0] : undefined;
  const indexed = entries.filter((entry) => entry !== featured);
  return (
    <section className="jrn-index" id="journal-articles" aria-label="Journal articles">
      <div className="jrn-tools">
        <div className="segmented" role="group" aria-label="Filter by topic">
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
          className="jrn-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search articles"
          aria-label="Search the journal"
        />
      </div>
      {featured && (
        <a className="jrn-feature" href={"/blog/" + featured.slug} data-reveal="fade">
          <span className="jrn-feature-top">
            <JournalMeta article={featured} />
            <span className="jrn-number" aria-hidden="true">01</span>
          </span>
          <h2>{featured.title}</h2>
          <p>{featured.summary}</p>
          <span className="jrn-read">
            Read article <ArrowUpRight size={15} aria-hidden="true" />
          </span>
        </a>
      )}
      {entries.length ? (
        <ul className="jrn-list" role="list">
          {indexed.map((item, index) => (
            <li key={item.slug}>
              <a href={"/blog/" + item.slug} data-reveal="rise">
                <span className="jrn-number" aria-hidden="true">
                  {String(index + (featured ? 2 : 1)).padStart(2, "0")}
                </span>
                <span className="jrn-row-main">
                  <JournalMeta article={item} />
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                </span>
                <ArrowUpRight size={17} className="jrn-row-arrow" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="jrn-empty" role="status">No articles match this search.</p>
      )}
    </section>
  );
}

export function JournalPage() {
  return (
    <div className="wrap jrn-page">
      <header className="jrn-hero">
        <span className="eyebrow">Journal</span>
        <h1>Field notes, written plainly.</h1>
        <p>Notes on how requests run, how you’re billed and what to check when something breaks.</p>
      </header>
      <JournalIndex />
    </div>
  );
}
