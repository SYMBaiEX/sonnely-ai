import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeSurface, ThemeSwitch } from "@/components/appearance";
import { SiteLinks } from "@/components/site-links";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeSurface className="site">
      <a href="#content" className="skip">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap site-nav glass">
          <Brand />
          <SiteLinks />
          <div className="site-actions">
            <ThemeSwitch />
            <Link href="/console" className="button accent">
              Open console <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <Brand />
          <p>Confidential inference workspace on Solana.</p>
          <nav aria-label="Footer">
            <Link href="/docs#privacy">Data handling</Link>
            <Link href="/contact">Support</Link>
            <Link href="/models">Model catalog</Link>
            <Link href="/pricing">Pricing</Link>
            <a href="https://app.sonnely.com">
              Original Sonnely app <ArrowUpRight size={13} />
            </a>
          </nav>
        </div>
      </footer>
    </ThemeSurface>
  );
}
