// spec/app/site/index.md, "Story: Check the service status"
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Moon,
  Sun,
} from "lucide-react";
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { footerGroups, headerLinks } from "./content.ts";
import "./appearance.ts";
import { AmbientVisualizer, MotionSwitch } from "./motion.tsx";
import { Scene } from "./scene.tsx";
import { ProductIcon } from "./icons.tsx";

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

export function ThemeSwitch({ choose = setTheme }: { choose?: (theme: Theme) => void }) {
  const theme = useTheme();
  const light = useSyncExternalStore(subscribeSystemLight, systemLight, () => false);
  const on = theme === "light" || (theme === "system" && light);
  return (
    <button
      className="theme-switch"
      type="button"
      role="switch"
      aria-label="Switch color theme"
      aria-checked={on}
      data-light={on}
      onClick={() => choose(on ? "dark" : "light")}
    >
      <span className="theme-switch-thumb" aria-hidden="true" />
      <span className="theme-switch-icon theme-switch-moon" aria-hidden="true">
        <Moon size={16} />
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

const shellRules = ".theme-root.site button:disabled{filter:saturate(.3)}";

export function ShellRules() {
  return <style>{shellRules}</style>;
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="brand" aria-label="Sonnely">
      <span className="brand-icon" aria-hidden="true" />
      <span className="brand-wordmark" aria-hidden="true" />
    </a>
  );
}

export function SiteHeader({ current }: { current: string }) {
  return (
    <header className="site-header" aria-label="Sonnely">
      <div className="wrap site-nav glass">
        <Brand />
        <SiteNavigation current={current} />
      </div>
    </header>
  );
}

function SiteNavigation({ current }: { current: string }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const mobileOpen = openPath !== null;
  const consoleAction = (
    <a href="/console/chat" className="button accent">
      Open console <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );

  const closeMobile = () => setOpenPath(null);

  return (
    <>
      {mobileOpen && (
        <button type="button" className="nav-dismiss" aria-label="Close navigation" onClick={closeMobile} />
      )}
      <nav aria-label="Main navigation" data-mobile-open={mobileOpen || undefined}>
        {headerLinks.map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={current === href ? "page" : undefined}
            onClick={closeMobile}
          >
            {label}
          </a>
        ))}
        <div className="nav-mobile-console" onClick={closeMobile}>
          {consoleAction}
        </div>
      </nav>
      <div className="site-actions">
        <ThemeSwitch />
        {consoleAction}
        <button
          className="mobile-menu-control"
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setOpenPath(mobileOpen ? null : "/")}
        >
          <span className="mobile-menu-glyph" aria-hidden="true">
            <span />
          </span>
        </button>
      </div>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <div className="footer-proof">
          <div className="footer-proof-readout" aria-hidden="true">
            <span className="footer-proof-segment">
              <i className="footer-proof-dot" />
              <ProductIcon name="Cpu" size={13} /> inference · tee enclave
            </span>
            <span className="footer-proof-segment">
              <ProductIcon name="Fingerprint" size={13} /> attestation · verified
            </span>
            <span className="footer-proof-segment">
              <ProductIcon name="ReceiptText" size={13} /> settlement · solana
            </span>
            <span className="footer-proof-cursor" />
          </div>
          <a href="/verify" className="footer-proof-link">
            Verify a receipt <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
        <div className="footer-brand">
          <Brand />
          <p>Confidential AI inference, routed and verified on Solana.</p>
          <div className="footer-social" aria-label="Sonnely elsewhere">
            <a href="https://github.com/Sonnely-AI" aria-label="Sonnely on GitHub">
              GitHub <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href="https://x.com/sonnelyai" aria-label="Sonnely on X">
              X <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </div>
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
          <a href="/docs/quickstart">API quickstart <ArrowUpRight size={13} aria-hidden="true" /></a>
          <MotionSwitch icon />
          <p>© Sonnely</p>
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
      <ShellRules />
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

export function ReaderNavigation({
  sections,
}: {
  sections: readonly (readonly [id: string, label: string])[];
}) {
  return (
    <nav className="reader-toc" aria-label="On this page">
      <strong>On this page</strong>
      {sections.map(([id, label]) => (
        <a key={id} href={"#" + id}>
          {label}
        </a>
      ))}
    </nav>
  );
}

export function SiteLead({
  title,
  description,
  status,
  brief,
  back = ["/", "Sonnely"],
  children,
}: {
  title: string;
  description: string;
  status?: string;
  brief?: SiteBrief;
  back?: readonly [href: string, label: string];
  children?: ReactNode;
}) {
  return (
    <header className="page-lead market-lead" data-brief={brief ? "" : undefined}>
      <Scene />
      <div className="market-lead-copy">
        <div className="market-lead-nav">
          <a href={back[0]} className="market-back">
            <ArrowLeft size={14} aria-hidden="true" /> {back[1]}
          </a>
          {status && <span className="market-status">{status}</span>}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      {brief && (
        <figure className="market-brief">
          <figcaption>{brief.title}</figcaption>
          <dl>
            {brief.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </figure>
      )}
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
