// spec/app/compute/index.md: the console sections this area owns — Consoles (blackbox rentals) and Docks (dry-dock builds).
import type { Page } from "../../../../gen/app__nav.ts";
import "./compute-legacy.css";
import { ConsoleFrame } from "../console/frame.tsx";
import { Consoles } from "./consoles.tsx";
import { Docks } from "./docks.tsx";

export function render(page: Page): React.ReactNode {
  if (page.tag === "Console" && page.section === "Consoles")
    return (
      <ConsoleFrame section={page.section}>
        <Consoles />
      </ConsoleFrame>
    );
  if (page.tag === "Console" && page.section === "Docks")
    return (
      <ConsoleFrame section={page.section}>
        <Docks />
      </ConsoleFrame>
    );
  return null;
}
