// spec/app/console/index.md: the workspace sections this area renders — Chat, Catalog, Logs, Batch and
// Settings inside the console frame; the other sections belong to their own areas.
import type { Page } from "../../../../gen/app__nav.ts";
import { ConsoleFrame } from "./frame.tsx";
import { BatchSection } from "./batch.tsx";
import { CatalogSection } from "./catalog.tsx";
import { ChatSection } from "./chat.tsx";
import { LogsSection } from "./logs.tsx";
import { SettingsSection } from "./settings.tsx";

export function render(page: Page): React.ReactNode {
  if (page.tag !== "Console") return null;
  switch (page.section) {
    case "Chat":
      return (
        <ConsoleFrame section={page.section}>
          <ChatSection />
        </ConsoleFrame>
      );
    case "Catalog":
      return (
        <ConsoleFrame section={page.section}>
          <CatalogSection />
        </ConsoleFrame>
      );
    case "Logs":
      return (
        <ConsoleFrame section={page.section}>
          <LogsSection />
        </ConsoleFrame>
      );
    case "Batch":
      return (
        <ConsoleFrame section={page.section}>
          <BatchSection />
        </ConsoleFrame>
      );
    case "Settings":
      return (
        <ConsoleFrame section={page.section}>
          <SettingsSection />
        </ConsoleFrame>
      );
    default:
      return null;
  }
}
