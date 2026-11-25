// spec/app/nav.md, "Pages and console sections"
import { docAt, isDoc } from "../../gen/app__docs.ts";
import { catalog } from "../../gen/app__models.ts";
import type { Page, Section } from "../../gen/app__nav.ts";
import { providerNames, providerOfSlug } from "./areas/site/data.ts";
import { pages } from "./areas/site/content.ts";
import { articles } from "./areas/site/journal.ts";

const home = "Sonnely | Private AI on Solana";
const titled = (title: string) => `${title} | Sonnely`;

const consoleTitles: Record<Section, string> = {
  Chat: "Chat Console",
  Catalog: "Models Console",
  Keys: "Keys Console",
  Usage: "Usage Console",
  Logs: "Logs Console",
  Batch: "Batch Console",
  Consoles: "Blackboxes Console",
  Docks: "Dry Docks Console",
  Billing: "Billing Console",
  Teams: "Teams Console",
  Referrals: "Referrals Console",
  Support: "Support Console",
  Settings: "Settings Console",
  Admin: "Admin Console",
};

export function titleOf(page: Page): string {
  switch (page.tag) {
    case "Home":
      return home;
    case "Inference":
      return titled(pages.inference[0]);
    case "Observability":
      return titled(pages.observability[0]);
    case "Compute":
      return titled(pages.compute[0]);
    case "Blackboxes":
      return titled(pages.blackboxes[0]);
    case "DryDocks":
      return titled(pages["dry-docks"][0]);
    case "Models":
      return titled(pages.models[0]);
    case "Model": {
      const entry = catalog.find(
        (row) => row.provider === providerOfSlug[page.provider] && row.upstreamId === page.model,
      );
      return entry ? titled(`${entry.name} on ${providerNames[entry.provider]}`) : home;
    }
    case "Status":
      return titled("Service status");
    case "Journal":
      return titled("Field notes");
    case "Post": {
      const article = articles.find((item) => item.slug === page.slug);
      return article ? titled(article.title) : home;
    }
    case "Privacy":
      return titled("Privacy Notice");
    case "Terms":
      return titled("Terms of Service");
    case "Verify":
      return titled("Verify an inference receipt");
    case "Contact":
      return titled(pages.contact[0]);
    case "Docs":
      return titled(docAt("index").title);
    case "Doc":
      return isDoc(page.slug) ? titled(docAt(page.slug).title) : home;
    case "Console":
      return titled(consoleTitles[page.section]);
    case "Unknown":
      return home;
  }
}
