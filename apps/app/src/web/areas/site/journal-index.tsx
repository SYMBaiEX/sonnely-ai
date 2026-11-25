// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@repo/ui";
import { articles } from "./journal.ts";
import {
  buttonSmall,
  eyebrow,
  pill,
  searchBox,
  sectionHead,
  serif,
  textLink,
} from "./ui.ts";

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
  return (
    <section className="journal-index" id="journal-articles" aria-labelledby="journal-heading">
      <div className={sectionHead}>
        <div>
          <p className={eyebrow}>Field notes</p>
          <h2
            id="journal-heading"
            style={serif}
            className="max-w-160 text-[clamp(26px,4vw,38px)] font-normal leading-tight"
          >
            Notes on how requests run, how you’re billed, and what to check when something breaks.
          </h2>
        </div>
      </div>
      <div className="journal-tools">
        <div className="journal-filters" role="group" aria-label="Filter by topic">
          {topics.map((item) => (
            <button
              key={item}
              type="button"
              className={buttonSmall}
              aria-pressed={item === topic}
              onClick={() => setTopic(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="search journal-search">
          <Search size={17} aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the journal"
            aria-label="Search the journal"
            className="border-0 bg-transparent px-0 shadow-none"
          />
        </label>
      </div>
      {featured && (
        <a
          className="panel journal-feature"
          href={"/blog/" + featured.slug}
        >
          <div>
            <p className={eyebrow}>{featured.category}</p>
            <h3 style={serif} className="my-2 text-[28px] font-normal">
              {featured.title}
            </h3>
            <p className="mb-3.5 text-sm text-muted-foreground">{featured.summary}</p>
            <span className={textLink}>
              Read article <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </div>
          <img
            src="/homepage/usage.webp"
            alt=""
            width={840}
            height={560}
            className="w-full rounded-md border border-border"
          />
        </a>
      )}
      {entries.length ? (
        <ul className="journal-list journal-tiles" role="list">
          {entries
            .filter((entry) => entry !== featured)
            .map((item) => (
              <li key={item.slug}>
                <a href={"/blog/" + item.slug}>
                  <span className="market-status">{item.category}</span>
                  <div>
                    <h3 className="text-base font-medium">{item.title}</h3>
                    <p className="mt-1 text-[13px] text-muted-foreground">{item.summary}</p>
                  </div>
                  <span className="text-link">
                    Read article <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </a>
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
