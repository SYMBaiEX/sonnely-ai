"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
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
    <section className="journal-index" id="journal-articles" aria-label="Journal articles">
      <div className="journal-tools">
        <div className="journal-filters" role="group" aria-label="Filter by topic">
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
        <Link className="panel journal-feature" href={"/blog/" + featured.slug} data-reveal="fade">
          <div>
            <p className="eyebrow">{featured.category}</p>
            <h2>{featured.title}</h2>
            <p>{featured.summary}</p>
            <span className="text-link">
              Read article <ArrowUpRight size={16} />
            </span>
          </div>
          <img src="/homepage/usage.webp" alt="" width={840} height={560} />
        </Link>
      )}
      {entries.length ? (
        <ul className="journal-list journal-tiles" role="list">
          {entries
            .filter((entry) => entry !== featured)
            .map((item) => (
              <li key={item.slug} data-reveal="rise">
                <Link href={"/blog/" + item.slug}>
                  <span className="market-status">{item.category}</span>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.summary}</p>
                  </div>
                  <span className="text-link">
                    Read article <ArrowUpRight size={15} aria-hidden />
                  </span>
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
