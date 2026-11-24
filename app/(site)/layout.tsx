import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MotionSwitch } from "@/components/ambient-motion";
import { Brand } from "@/components/brand";
import { ThemeSurface } from "@/components/appearance";
import { SiteHeader } from "@/components/site-header";
import { SonnelySocialLink } from "@/components/sonnely-social-link";
import "./site-pages.css";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeSurface className="site">
      <a href="#content" className="skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="content" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <div className="footer-brand">
            <Brand />
            <p>Confidential inference on Solana.</p>
            <Link href="/docs/quickstart" className="text-link">
              API quickstart <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <nav aria-label="Footer">
            <div className="footer-group">
              <h2>Platform</h2>
              <Link href="/inference">Confidential inference</Link>
              <Link href="/observability">Observability</Link>
              <Link href="/compute">Compute</Link>
              <Link href="/models">Model catalog</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/console">Playground</Link>
            </div>
            <div className="footer-group">
              <h2>Developers</h2>
              <Link href="/docs">Documentation</Link>
              <Link href="/docs/api">API reference</Link>
              <Link href="/docs/sdks">SDKs</Link>
              <Link href="/status">Status</Link>
            </div>
            <div className="footer-group">
              <h2>Sonnely</h2>
              <Link href="/blog">Journal</Link>
              <Link href="/contact">Support</Link>
              <SonnelySocialLink />
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
