"use client";

import type { Item, Separator } from "fumadocs-core/page-tree";
import { SidebarItem, SidebarSeparator } from "fumadocs-ui/components/sidebar/base";
import { useTheme } from "fumadocs-ui/provider/base";
import { Sidebar, type SidebarProps } from "fumadocs-ui/layouts/docs/slots/sidebar";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronRight,
  CircleHelp,
  Fingerprint,
  Moon,
  Rocket,
  Sun,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { apiOrigin } from "@/lib/api-contract";

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
    <SidebarItem href={item.url} active={active} external={item.external} className="docs-sidebar-link">
      {overview && <BookOpen size={16} aria-hidden="true" />}
      <span>{overview ? "Overview" : item.name}</span>
      {active && <ChevronRight size={14} aria-hidden="true" />}
    </SidebarItem>
  );
}

function DocsThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const light = resolvedTheme === "light";
  return (
    <button
      className="theme-switch"
      type="button"
      role="switch"
      aria-label="Switch color theme"
      aria-checked={light}
      data-light={light}
      suppressHydrationWarning
      onClick={() => setTheme(light ? "dark" : "light")}
    >
      <Moon size={15} aria-hidden="true" />
      <Sun size={15} aria-hidden="true" />
    </button>
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
          </nav>
          <DocsThemeSwitch />
        </div>
      }
    />
  );
}
