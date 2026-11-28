// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CopyButton as UiCopyButton } from "@repo/ui";
import { Brand } from "../../shell/brand.tsx";
import { MotionSwitch } from "../../shell/motion.tsx";
import { MobileMenuButton } from "../../shell/navigation.tsx";
import { ShellSurface } from "../../shell/surface.tsx";
import { ThemeSwitch } from "../../shell/theme.tsx";
import { footerGroups, headerLinks } from "./content.ts";
import "./appearance.ts";

export function SiteHeader({ current }: { current: string }) {
  return (
    <header className="site-header" aria-label="Sonnely">
      <SiteNavigation current={current} />
    </header>
  );
}

function SiteNavigation({ current }: { current: string }) {
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const mobileOpen = openRoute === current;
  const menuControlRef = useRef<HTMLButtonElement>(null);
  const closeMobile = () => setOpenRoute(null);
  if (openRoute !== null && !mobileOpen) setOpenRoute(null);

  function dismissMobile() {
    closeMobile();
    menuControlRef.current?.focus();
  }

  function handleEscape(event: KeyboardEvent<HTMLElement>) {
    if (mobileOpen && event.key === "Escape") {
      event.stopPropagation();
      dismissMobile();
    }
  }

  return (
    <div className="wrap site-nav" onKeyDown={handleEscape}>
      <Brand onClick={closeMobile} />
      {mobileOpen && (
        <button type="button" className="nav-dismiss" aria-label="Dismiss navigation" tabIndex={-1} onClick={dismissMobile} />
      )}
      <MobileMenuButton
        buttonRef={menuControlRef}
        open={mobileOpen}
        controls="site-navigation"
        label="navigation"
        onClick={() => setOpenRoute(mobileOpen ? null : current)}
      />
      <nav id="site-navigation" aria-label="Main navigation" data-mobile-open={mobileOpen || undefined}>
        {headerLinks.map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={current === href || current.startsWith(href + "/") ? "page" : undefined}
            onClick={closeMobile}
          >
            {label}
          </a>
        ))}
        <div className="nav-mobile-console">
          <ConsoleLink onClick={closeMobile} />
        </div>
      </nav>
      <div className="site-actions">
        <ThemeSwitch />
        <ConsoleLink />
      </div>
    </div>
  );
}

function ConsoleLink({ onClick }: { onClick?: () => void }) {
  return (
    <a href="/console/chat" className="button accent" onClick={onClick}>
      Open console <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <Brand />
          <p>Confidential AI inference on Solana.</p>
          <a href="/docs/quickstart" className="text-link">
            API quickstart <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
        <nav className="footer-nav" aria-label="Footer">
          {footerGroups.map(({ title, links }) => (
            <section className="footer-group" key={title} aria-labelledby={`footer-${title.toLowerCase()}`}>
              <h2 id={`footer-${title.toLowerCase()}`}>{title}</h2>
              <ul>
                {links.map(([href, label]) => (
                  <li key={href}>
                    <a href={href}>{label}</a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="footer-meta">
          <p>© Sonnely</p>
          <div className="footer-social">
            <a href="https://github.com/Sonnely-AI" aria-label="Sonnely on GitHub">
              GitHub <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href="https://x.com/sonnelyai" aria-label="Sonnely on X">
              X <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <MotionSwitch icon />
          </div>
        </div>
      </div>
    </footer>
  );
}

export function ThemeSurface({ current, children }: { current: string; children: ReactNode }) {
  return (
    <ShellSurface area="site" skipHref="#content" className="theme-root site">
      <SiteHeader current={current} />
      <main id="content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </ShellSurface>
  );
}

export interface SiteBrief {
  title: string;
  rows: readonly (readonly [label: string, value: string])[];
}

export function CorrespondenceHero({
  eyebrow,
  title,
  description,
  brief,
  actionsLabel = "Page actions",
  asideLabel = brief.title,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  brief: SiteBrief;
  actionsLabel?: string;
  asideLabel?: string;
  children: ReactNode;
}) {
  return (
    <header className="cor-pricing-hero">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <nav aria-label={actionsLabel}>{children}</nav>
      </div>
      <aside aria-label={asideLabel}>
        <span>{brief.title}</span>
        <dl>
          {brief.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </header>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  text = label,
}: {
  value: string;
  label?: string;
  text?: string;
}) {
  return <UiCopyButton value={value} label={label} text={text} className="button quiet small" />;
}
