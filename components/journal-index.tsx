"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import { articles } from "@/lib/journal";

const topics = ["All", ...new Set(articles.map((article) => article.category))];

export function JournalIndex() {
  const [topic, setTopic] = useState("All");
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const entries = articles.filter(
    (article) =>
      (topic === "All" || article.category === topic) &&
      (article.title + " " + article.summary + " " + article.category).toLowerCase().includes(term),
  );
  const featured = topic === "All" && !term ? entries[0] : undefined;
  return (
    <section className="journal-index" aria-label="Journal articles">
      <div className="journal-tools">
        <div className="journal-filters" aria-label="Filter by topic">
          {topics.map((item) => (
            <button
              key={item}
              type="button"
              className="button quiet small"
              aria-pressed={item === topic}
              onClick={() => setTopic(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="search journal-search">
          <Search size={17} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the journal"
            aria-label="Search the journal"
          />
        </label>
      </div>
      {featured && (
        <Link className="panel journal-feature" href={"/blog/" + featured.slug}>
          <div>
            <p className="eyebrow">{featured.category}</p>
            <h2>{featured.title}</h2>
            <p>{featured.summary}</p>
            <span className="text-link">
              Read article <ArrowUpRight size={16} />
            </span>
          </div>
          <span className="journal-feature-art" aria-hidden>
            <BookOpen size={45} strokeWidth={1.2} />
          </span>
        </Link>
      )}
      {entries.length ? (
        <ul className="panel journal-list" role="list">
          {entries
            .filter((entry) => entry !== featured)
            .map((item) => (
              <li key={item.slug}>
                <Link href={"/blog/" + item.slug}>
                  <span className="eyebrow">{item.category}</span>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.summary}</p>
                  </div>
                  <ArrowUpRight size={18} aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      ) : (
        <p className="empty" role="status">
          No articles match this search.
        </p>
      )}
    </section>
  );
}
