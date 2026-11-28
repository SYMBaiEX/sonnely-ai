// spec/app/site/index.md, "Story: Check the service status"
import {
  ArrowUpRight,
  Check,
  Copy,
  MonitorSmartphone,
  Moon,
  Sun,
} from "lucide-react";
import { useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { footerGroups, headerLinks } from "./content.ts";
import "./appearance.ts";
import { AmbientVisualizer, MotionSwitch } from "./motion.tsx";

export const themeKey = "sonnely.theme";
const legacyThemeKey = "fathom.theme";
const themeChangeEvent = "sonnely:theme";
export const motionKey = "sonnely.ambient-motion";
export const motionChangeEvent = "sonnely:ambient-motion";
export const reducedQuery = "(prefers-reduced-motion: reduce)";
let motionPaused = false;
export function setMotionPaused(value: boolean) {
  motionPaused = value;
}

export type Theme = "dark" | "light" | "system";

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(themeKey) ?? localStorage.getItem(legacyThemeKey);
    if (stored === "light" || stored === "system") return stored;
  } catch {
    return "dark";
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement.classList;
  root.toggle("dark", theme === "dark");
  root.toggle("light", theme === "light");
}

applyTheme(readTheme());

function subscribeTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(themeChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeChangeEvent, onChange);
  };
}

export function useTheme() {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as const);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    applyTheme(theme);
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(themeChangeEvent));
}

const systemLight = () => matchMedia("(prefers-color-scheme: light)").matches;
const reducedMotion = () => matchMedia(reducedQuery).matches;

function subscribeMotion(update: () => void) {
  const media = matchMedia(reducedQuery);
  media.addEventListener("change", update);
  window.addEventListener("storage", update);
  window.addEventListener(motionChangeEvent, update);
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("storage", update);
    window.removeEventListener(motionChangeEvent, update);
  };
}

function motionEnabled() {
  if (reducedMotion()) return false;
  try {
    return localStorage.getItem(motionKey) !== "off";
  } catch {
    return !motionPaused;
  }
}

export function useAmbientMotion() {
  return useSyncExternalStore(subscribeMotion, motionEnabled, () => true);
}

function subscribeSystemLight(update: () => void) {
  const media = matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}

const nextTheme: Record<Theme, Theme> = { dark: "system", system: "light", light: "dark" };

export function ThemeSwitch({ choose = setTheme }: { choose?: (theme: Theme) => void }) {
  const theme = useTheme();
  const light = useSyncExternalStore(subscribeSystemLight, systemLight, () => false);
  const on = theme === "light" || (theme === "system" && light);
  return (
    <button
      className="theme-switch"
      type="button"
      aria-label={`Color theme: ${theme}. Activate for ${nextTheme[theme]}.`}
      data-light={on}
      data-theme-pos={theme}
      onClick={() => choose(nextTheme[theme])}
    >
      <span className="theme-switch-thumb" aria-hidden="true" />
      <span className="theme-switch-icon theme-switch-moon" aria-hidden="true">
        <Moon size={16} />
      </span>
      <span className="theme-switch-icon theme-switch-system" aria-hidden="true">
        <MonitorSmartphone size={15} />
      </span>
      <span className="theme-switch-icon theme-switch-sun" aria-hidden="true">
        <Sun size={17} />
      </span>
    </button>
  );
}

export const accentTokenAliases = {
  "--action": "var(--primary)",
  // eslint-disable-next-line design-system/no-literal-colors -- the hover weight derives from the live primary by darkening it
  "--action-hover": "color-mix(in oklch, var(--primary) 85%, black)",
  "--accent": "var(--ring)",
  "--focus-ring": "var(--ring)",
} as CSSProperties;

export function Brand({ href = "/", onClick }: { href?: string; onClick?: () => void }) {
  return (
    <a href={href} className="brand" aria-label="Sonnely" onClick={onClick}>
      <span className="brand-icon" aria-hidden="true" />
      <span className="brand-wordmark" aria-hidden="true" />
    </a>
  );
}

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
      <button
        ref={menuControlRef}
        className="mobile-menu-control"
        type="button"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
        aria-controls="site-navigation"
        onClick={() => setOpenRoute(mobileOpen ? null : current)}
      >
        <span className="mobile-menu-glyph" aria-hidden="true">
          <span />
        </span>
      </button>
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
  const theme = useTheme();
  const motion = useAmbientMotion();
  return (
    <div
      className="theme-root site"
      data-area="site"
      data-theme={theme}
      data-motion={motion ? "on" : "off"}
      style={accentTokenAliases}
    >
      <a href="#content" className="skip">
        Skip to content
      </a>
      <div className="workspace-scene" aria-hidden="true" />
      <SiteHeader current={current} />
      <main id="content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
      <AmbientVisualizer motion={motion} theme={theme} />
    </div>
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
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
  }
  return (
    <button
      type="button"
      className="button quiet small"
      onClick={() => void copy()}
      onBlur={() => setStatus("")}
      onPointerLeave={() => setStatus("")}
      aria-label={status || label}
    >
      {status === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span>{status || text}</span>
    </button>
  );
}
