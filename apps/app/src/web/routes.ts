// spec/app/nav.md, "Pages and console sections"
import type { Page, Section } from "../../gen/app__nav.ts";

const sections: Record<string, Section> = {
  chat: "Chat",
  models: "Catalog",
  keys: "Keys",
  usage: "Usage",
  logs: "Logs",
  batch: "Batch",
  billing: "Billing",
  teams: "Teams",
  referrals: "Referrals",
  support: "Support",
  settings: "Settings",
  admin: "Admin",
};

const sectionPaths = Object.fromEntries(Object.entries(sections).map(([path, section]) => [section, path]));

export function pathOf(page: Page): string {
  switch (page.tag) {
    case "Home": return "/";
    case "Inference": return "/inference";
    case "Models": return "/models";
    case "Pricing": return "/pricing";
    case "Model": return `/models/${page.provider}/${page.model}`;
    case "Status": return "/status";
    case "Journal": return "/blog";
    case "Post": return `/blog/${page.slug}`;
    case "Privacy": return "/privacy";
    case "Terms": return "/terms";
    case "Verify": return "/verify";
    case "Contact": return "/contact";
    case "Docs": return "/docs";
    case "Doc": return `/docs/${page.slug}`;
    case "Console": return `/console/${sectionPaths[page.section] ?? "chat"}${page.section === "Admin" && page.area ? `/${page.area}` : ""}`;
    case "Unknown": return "/404";
  }
}

/** Where an old address moved, if it did: /observability merged into /inference. */
export function redirectOf(path: string): string | null {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/observability") return "/inference";
  return null;
}

export function pageOf(path: string): Page {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return { tag: "Home" };
  const parts = clean.slice(1).split("/");
  switch (parts[0]) {
    case "inference": return { tag: "Inference" };
    case "observability": return { tag: "Inference" };
    case "models":
      return parts.length > 2
        ? { tag: "Model", provider: decodeURIComponent(parts[1]), model: parts.slice(2).map(decodeURIComponent).join("/") }
        : { tag: "Models" };
    case "status": return { tag: "Status" };
    case "blog": return parts[1] ? { tag: "Post", slug: parts.slice(1).map(decodeURIComponent).join("/") } : { tag: "Journal" };
    case "privacy": return { tag: "Privacy" };
    case "terms": return { tag: "Terms" };
    case "verify": return { tag: "Verify" };
    case "contact": return { tag: "Contact" };
    case "pricing": return { tag: "Pricing" };
    case "docs": return parts[1] ? { tag: "Doc", slug: parts.slice(1).map(decodeURIComponent).join("/") } : { tag: "Docs" };
    case "console": {
      const section = sections[parts[1] ?? "chat"] ?? "Chat";
      return { tag: "Console", section, area: section === "Admin" ? (parts[2] ?? "") : "" };
    }
    default: return { tag: "Unknown" };
  }
}
