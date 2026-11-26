// spec/app/nav.md, "Pages and console sections"
import type { Page, Section } from "../../gen/app__nav.ts";

const sections: Record<string, Section> = {
  chat: "Chat",
  models: "Catalog",
  keys: "Keys",
  usage: "Usage",
  logs: "Logs",
  batch: "Batch",
  blackboxes: "Consoles",
  "dry-docks": "Docks",
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
    case "Observability": return "/observability";
    case "Compute": return "/compute";
    case "Blackboxes": return "/blackboxes";
    case "DryDocks": return "/dry-docks";
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
    case "ContactOne": return "/contact-1";
    case "ContactTwo": return "/contact-2";
    case "ContactThree": return "/contact-3";
    case "ContactFour": return "/contact-4";
    case "Docs": return "/docs";
    case "Doc": return `/docs/${page.slug}`;
    case "Console": return `/console/${sectionPaths[page.section] ?? "chat"}${page.section === "Admin" && page.area ? `/${page.area}` : ""}`;
    case "Unknown": return "/404";
  }
}

export function pageOf(path: string): Page {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return { tag: "Home" };
  const parts = clean.slice(1).split("/");
  switch (parts[0]) {
    case "inference": return { tag: "Inference" };
    case "observability": return { tag: "Observability" };
    case "compute": return { tag: "Compute" };
    case "blackboxes": return { tag: "Blackboxes" };
    case "dry-docks": return { tag: "DryDocks" };
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
    case "contact-1": return { tag: "ContactOne" };
    case "contact-2": return { tag: "ContactTwo" };
    case "contact-3": return { tag: "ContactThree" };
    case "contact-4": return { tag: "ContactFour" };
    case "pricing": return { tag: "Pricing" };
    case "docs": return parts[1] ? { tag: "Doc", slug: parts.slice(1).map(decodeURIComponent).join("/") } : { tag: "Docs" };
    case "console": {
      const section = sections[parts[1] ?? "chat"] ?? "Chat";
      return { tag: "Console", section, area: section === "Admin" ? (parts[2] ?? "") : "" };
    }
    default: return { tag: "Unknown" };
  }
}
