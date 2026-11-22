import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ThemeSwitch } from "@/components/appearance";
import { Brand } from "@/components/brand";
import { SiteLinks } from "@/components/site-links";

export function SiteHeader({
  homeHref,
  themeSwitch = <ThemeSwitch />,
}: {
  homeHref?: string;
  themeSwitch?: ReactNode;
}) {
  return (
    <header className="site-header" aria-label="Sonnely">
      <div className="wrap site-nav glass">
        <Brand href={homeHref} />
        <SiteLinks />
        <div className="site-actions">
          {themeSwitch}
          <Link href="/console" className="button accent">
            Open console <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
