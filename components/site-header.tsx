import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ThemeSwitch } from "@/components/appearance";
import { Brand } from "@/components/brand";
import { SiteLinks } from "@/components/site-links";
import { apiOrigin } from "@/lib/api-contract";

export function SiteHeader({
  fromDocs = false,
  themeSwitch = <ThemeSwitch />,
}: {
  fromDocs?: boolean;
  themeSwitch?: ReactNode;
}) {
  // Links from the docs subdomain redirect to the main site.
  const ConsoleLink = fromDocs ? "a" : Link;
  return (
    <header className="site-header" aria-label="Sonnely">
      <div className="wrap site-nav glass">
        <Brand href={fromDocs ? apiOrigin : undefined} />
        <SiteLinks fromDocs={fromDocs} />
        <div className="site-actions">
          {themeSwitch}
          <ConsoleLink href="/console" className="button accent">
            Open console <ArrowUpRight size={15} aria-hidden="true" />
          </ConsoleLink>
        </div>
      </div>
    </header>
  );
}
