"use client";

import type { Item, Separator } from "fumadocs-core/page-tree";
import { SidebarItem, SidebarSeparator } from "fumadocs-ui/components/sidebar/base";
import { Sidebar, type SidebarProps } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { ArrowUpRight, BookOpen, Box, ChevronRight, CircleHelp, Fingerprint, Rocket } from "lucide-react";
import { usePathname } from "next/navigation";
import { apiOrigin } from "@/lib/api-contract";
import { SonnelySocialLink } from "@/components/sonnely-social-link";

const sectionIcons = {
  "Get started": Rocket,
  Inference: Fingerprint,
  Compute: Box,
  Support: CircleHelp,
} as const;

function SectionHeading({ item }: { item: Separator }) {
  const label = typeof item.name === "string" ? item.name : "";
  const Icon = sectionIcons[label as keyof typeof sectionIcons];
  return (
    <SidebarSeparator className="docs-sidebar-section">
      {Icon && <Icon size={15} aria-hidden="true" />}
      {item.name}
    </SidebarSeparator>
  );
}

function PageLink({ item }: { item: Item }) {
  const active = usePathname() === item.url;
  const overview = item.url === "/docs";
  return (
    <SidebarItem
      href={item.url}
      active={active}
      external={item.external}
      className="docs-sidebar-link"
      data-overview={overview || undefined}
    >
      {overview && <BookOpen size={16} aria-hidden="true" />}
      <span>{overview ? "Overview" : item.name}</span>
      <ChevronRight size={14} className="docs-sidebar-chevron" aria-hidden="true" />
    </SidebarItem>
  );
}

export function SonnelyDocsSidebar(props: SidebarProps) {
  return (
    <Sidebar
      {...props}
      aria-label="Documentation sidebar"
      components={{ Item: PageLink, Separator: SectionHeading }}
      footer={
        <div className="docs-sidebar-footer">
          <nav aria-label="Sonnely links">
            <a href={apiOrigin}>
              Sonnely <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href={apiOrigin + "/console"}>
              Console <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href={apiOrigin + "/status"}>
              Status <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <SonnelySocialLink compact />
          </nav>
        </div>
      }
    />
  );
}
