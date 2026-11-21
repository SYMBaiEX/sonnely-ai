import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeSurface, ThemeSwitch } from "@/components/appearance";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeSurface className="site">
      <a href="#content" className="skip">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap site-nav glass">
          <Brand />
          <nav aria-label="Main navigation">
            <Link href="/models">Models</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/blog">Journal</Link>
            <Link href="/contact">Contact</Link>
          </nav>
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
          </nav>
        </div>
      </footer>
    </ThemeSurface>
  );
}
