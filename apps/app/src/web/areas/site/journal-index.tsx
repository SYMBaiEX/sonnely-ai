// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { SearchField } from "../../search.tsx";
import { articles, categoryIcons, readingMinutes } from "./journal.ts";
import { ProductIcon } from "./icons.tsx";

const topics = ["All", ...new Set(articles.map((article) => article.category))];

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
    <section className="cor-archive" id="journal-articles" aria-label="Journal articles">
      <div className="cor-archive-tools">
        <div role="group" aria-label="Filter by topic">
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
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the archive"
          aria-label="Search the journal"
        />
      </div>
      {featured && (
        <a className="cor-featured-dispatch" href={"/blog/" + featured.slug}>
          <span className="cor-dispatch-stamp" aria-hidden="true">
            <ProductIcon name={categoryIcons[featured.category] ?? "Box"} size={21} />
          </span>
          <div className="cor-featured-main">
            <span className="cor-dispatch-meta">
              {featured.category} · {readingMinutes(featured)} min read
            </span>
            <h2>{featured.title}</h2>
            <p>{featured.summary}</p>
            <span className="cor-open-link">Open the latest dispatch <ArrowUpRight size={15} aria-hidden="true" /></span>
          </div>
          <span className="cor-dispatch-number" aria-hidden="true">01</span>
        </a>
      )}
      {entries.length ? (
        <ul className="cor-archive-list" role="list">
          {indexed.map((item, index) => (
            <li key={item.slug}>
              <a href={"/blog/" + item.slug}>
                <span className="cor-archive-number">{String(index + (featured ? 2 : 1)).padStart(2, "0")}</span>
                <div className="cor-archive-main">
                  <span className="cor-dispatch-meta">
                    <ProductIcon name={categoryIcons[item.category] ?? "Box"} size={13} />
                    {item.category} · {readingMinutes(item)} min read
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                </div>
                <span className="cor-open-link">Read dispatch <ArrowUpRight size={14} aria-hidden="true" /></span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cor-empty" role="status">No letters match this search.</p>
      )}
    </section>
  );
}

export function JournalPage() {
  const categories = new Set(articles.map((article) => article.category)).size;
  const minutes = articles.reduce((total, article) => total + readingMinutes(article), 0);
  return (
    <div className="wrap cor-page cor-journal-page">
      <header className="cor-journal-hero">
        <div>
          <span>Correspondence archive</span>
          <h1>Field notes, written plainly.</h1>
          <p>Notes on how requests run, how you’re billed and what to check when something breaks.</p>
        </div>
        <aside aria-label="Archive summary">
          <span>Archive index</span>
          <dl>
            <div><dt>Dispatches</dt><dd>{articles.length}</dd></div>
            <div><dt>Desks</dt><dd>{categories}</dd></div>
            <div><dt>Reading time</dt><dd>{minutes} min</dd></div>
          </dl>
        </aside>
      </header>
      <JournalIndex />
    </div>
  );
}
