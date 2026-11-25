// spec/app/compute/index.md: the console sections this area owns — Consoles (blackbox rentals) and Docks (dry-dock builds).
import type { Page } from "../../../../gen/app__nav.ts";
import { Consoles } from "./consoles.tsx";
import { Docks } from "./docks.tsx";

export function render(page: Page): React.ReactNode {
  if (page.tag === "Console" && page.section === "Consoles") return <Consoles />;
  if (page.tag === "Console" && page.section === "Docks") return <Docks />;
  return null;
}
