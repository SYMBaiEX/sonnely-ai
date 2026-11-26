// spec/app/compute/index.md: the console sections this area owns — Consoles (blackbox rentals) and Docks (dry-dock builds).
import { Box, Container, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@repo/ui";
import type { Page } from "../../../../gen/app__nav.ts";
import "./compute-legacy.css";
import { ConsoleFrame } from "../console/frame.tsx";
import { sectionReleased } from "../console/features.ts";
import { Consoles } from "./consoles.tsx";
import { Docks } from "./docks.tsx";

function UnreleasedSection({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <EmptyState title={title + " are not available yet."} icon={icon}>
      <p className="max-w-md text-sm text-muted-foreground">
        This compute feature is still being built. Inference, keys and billing are ready in the rest of the console.
      </p>
      <a className="inline-flex items-center gap-1.5 text-sm font-medium text-primary" href="/console/chat">
        Back to the playground <ArrowRight size={15} aria-hidden="true" />
      </a>
    </EmptyState>
  );
}

export function render(page: Page): React.ReactNode {
  if (page.tag === "Console" && page.section === "Consoles")
    return (
      <ConsoleFrame section={page.section}>
        {sectionReleased(page.section) ? <Consoles /> : <UnreleasedSection title="Blackboxes" icon={<Box size={28} />} />}
      </ConsoleFrame>
    );
  if (page.tag === "Console" && page.section === "Docks")
    return (
      <ConsoleFrame section={page.section}>
        {sectionReleased(page.section) ? <Docks /> : <UnreleasedSection title="Dry Docks" icon={<Container size={28} />} />}
      </ConsoleFrame>
    );
  return null;
}
