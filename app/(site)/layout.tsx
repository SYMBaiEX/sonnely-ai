import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MotionSwitch } from "@/components/ambient-motion";
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
          <div className="footer-brand">
            <Brand />
            <p>Confidential inference on Solana.</p>
          </div>
          <nav aria-label="Footer">
            <div className="footer-group">
              <h2>Platform</h2>
              <Link href="/models">Model catalog</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/console">Playground</Link>
            </div>
            <div className="footer-group">
              <h2>Developers</h2>
              <Link href="/docs">Documentation</Link>
              <Link href="/docs#api">API reference</Link>
              <Link href="/status">Status</Link>
            </div>
            <div className="footer-group">
              <h2>Sonnely</h2>
              <Link href="/blog">Journal</Link>
              <Link href="/contact">Support</Link>
            </div>
            <div className="footer-group">
              <h2>Legal</h2>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </nav>
          <MotionSwitch icon />
        </div>
      </footer>
    </ThemeSurface>
  );
}
