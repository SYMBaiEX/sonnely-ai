// spec/app/console/index.md: presentation-level availability of console features.
// Blackbox rentals and dry-dock builds are unreleased: their machines and backends stay,
// but the console does not navigate to them, and their addresses explain rather than
// rendering dead surfaces. The frame, the command menu and the owning areas all consult
// this one module, so launching a feature is a one-line change here.
import type { Section } from "../../../../gen/app__nav.ts";

const unreleasedSections: ReadonlySet<Section> = new Set(["Consoles", "Docks"]);

export function sectionReleased(section: Section): boolean {
  return !unreleasedSections.has(section);
}
