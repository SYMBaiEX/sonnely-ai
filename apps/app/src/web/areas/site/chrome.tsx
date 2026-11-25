// spec/app/site/index.md, "Story: Check the service status"
import { ArrowLeft, ArrowUpRight, Check, Copy, Moon, Sun } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { footerGroups, headerLinks, productsMenu } from "./content.ts";
import { ProductIcon } from "./icons.tsx";
import {
  buttonAccent,
  buttonSmall,
  pill,
  serif,
  textLink,
  wrap,
} from "./ui.ts";

export const themeKey = "sonnely.theme";
const legacyThemeKey = "fathom.theme";
const themeChangeEvent = "sonnely:theme";
const motionKey = "sonnely.ambient-motion";
const motionChangeEvent = "sonnely:ambient-motion";
const reducedQuery = "(prefers-reduced-motion: reduce)";
const motionPaused = false;

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

export function ThemeSwitch() {
  const theme = useTheme();
  const light = useSyncExternalStore(subscribeSystemLight, systemLight, () => false);
  const on = theme === "light" || (theme === "system" && light);
  return (
    <button
      className="relative inline-flex h-6.5 w-11.5 items-center rounded-full border border-border bg-secondary text-muted-foreground"
      type="button"
      role="switch"
      aria-label="Switch color theme"
      aria-checked={on}
      onClick={() => setTheme(on ? "dark" : "light")}
    >
      <span
        className={
          "absolute start-0.75 top-0.5 size-5 rounded-full bg-primary transition-transform duration-base " +
          (on ? "translate-x-4.5" : "")
        }
        aria-hidden="true"
      />
      <span
        className={
          "absolute start-0.75 grid size-5 place-items-center " +
          (on ? "text-muted-foreground" : "text-primary-foreground")
        }
        aria-hidden="true"
      >
        <Moon size={13} />
      </span>
      <span
        className={
          "absolute end-0.75 grid size-5 place-items-center " +
          (on ? "text-primary-foreground" : "text-muted-foreground")
        }
        aria-hidden="true"
      >
        <Sun size={13} />
      </span>
    </button>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-2" aria-label="Sonnely">
      <img src="/brand/sonnely-icon.svg" alt="" className="size-7.5" />
      <img src="/brand/sonnely-wordmark.svg" alt="Sonnely" className="h-5 w-auto dark:invert" />
    </a>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 py-3" aria-label="Sonnely">
      <div
        className={
          wrap +
          " flex items-center gap-6 rounded-lg border border-border bg-card/85 px-4.5 py-2.5 backdrop-blur-md"
        }
      >
        <Brand />
        <details className="group relative ms-auto min-[900px]:hidden">
          <summary aria-label="Menu" className="grid cursor-pointer gap-1 p-2.5">
            <span aria-hidden="true" className="h-0.5 w-4.5 rounded bg-foreground" />
            <span aria-hidden="true" className="h-0.5 w-4.5 rounded bg-foreground" />
            <span aria-hidden="true" className="h-0.5 w-4.5 rounded bg-foreground" />
          </summary>
          <nav
            className="absolute end-0 top-[calc(100%+12px)] z-10 grid min-w-55 gap-0.5 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
            aria-label="Main navigation"
          >
            {productsMenu.map(({ href, label }) => (
              <a key={href} href={href} className="rounded-sm px-3 py-2.5 hover:bg-accent">
                {label}
              </a>
            ))}
            {headerLinks.map(([href, label]) => (
              <a key={href} href={href} className="rounded-sm px-3 py-2.5 hover:bg-accent">
                {label}
              </a>
            ))}
            <a
              href="/console/chat"
              className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2.5 text-primary-foreground"
            >
              Open console <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
        </details>
        <nav className="hidden items-center gap-4.5 text-sm min-[900px]:flex" aria-label="Main navigation">
          <details className="group relative">
            <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
              Platform <span className="text-[10px]" aria-hidden="true">▾</span>
            </summary>
            <ul
              aria-label="Platform pages"
              className="absolute start-[-12px] top-[calc(100%+14px)] z-10 grid min-w-75 gap-0.5 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg"
            >
              {productsMenu.map(({ href, label, detail, icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    className="flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="grid size-8.5 place-items-center rounded-sm bg-secondary">
                      <ProductIcon name={icon} size={17} />
                    </span>
                    <span>
                      <strong className="block text-sm font-medium">{label}</strong>
                      <small className="text-xs text-muted-foreground">{detail}</small>
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" className="ms-auto" />
                  </a>
                </li>
              ))}
            </ul>
          </details>
          {headerLinks.map(([href, label]) => (
            <a key={href} href={href} className="text-muted-foreground hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 min-[900px]:flex">
          <ThemeSwitch />
          <a href="/console/chat" className={buttonAccent}>
            Open console <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-card py-12">
      <div className={wrap + " grid gap-12 min-[800px]:grid-cols-[240px_1fr]"}>
        <div>
          <Brand />
          <p className="my-3 text-sm text-muted-foreground">Confidential inference on Solana.</p>
          <a href="/docs/quickstart" className={textLink}>
            API quickstart <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-6 min-[800px]:grid-cols-4">
          {footerGroups.map(({ title, links }) => (
            <div className="grid content-start gap-2.5 text-sm" key={title}>
              <h2 className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                {title}
              </h2>
              {links.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  {label}
                </a>
              ))}
              {title === "Sonnely" && (
                <a
                  href="https://x.com/sonnelyai"
                  aria-label="Sonnely on X"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  Sonnely on X <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function ThemeSurface({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const motion = useAmbientMotion();
  return (
    <div data-area="site" data-motion={motion ? "on" : "off"} data-theme={theme}>
      <a
        href="#content"
        className="absolute -top-12 start-3 z-20 rounded-sm bg-primary px-3.5 py-2 text-primary-foreground transition-[top] duration-base focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
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
    <nav className="grid gap-2 text-sm min-[800px]:sticky min-[800px]:top-24" aria-label="On this page">
      <strong className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
        On this page
      </strong>
      {sections.map(([id, label]) => (
        <a key={id} href={"#" + id} className="text-muted-foreground hover:text-foreground">
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
    <header
      className={
        "my-10 grid gap-6 " + (brief ? "min-[800px]:grid-cols-[minmax(0,1fr)_300px] min-[800px]:items-end" : "")
      }
    >
      <div>
        <div className="mb-5 flex items-center gap-3">
          <a
            href={back[0]}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} aria-hidden="true" /> {back[1]}
          </a>
          {status && <span className={pill}>{status}</span>}
        </div>
        <h1 style={serif} className="text-[clamp(34px,5vw,56px)] leading-[1.05] font-normal">
          {title}
        </h1>
        <p className="mt-3.5 max-w-140 text-base text-muted-foreground">{description}</p>
        {children}
      </div>
      {brief && (
        <figure className="rounded-lg border border-border bg-card px-5 py-4.5 shadow-sm">
          <figcaption className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            {brief.title}
          </figcaption>
          <dl className="grid gap-2.5">
            {brief.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-[13px]">
                <dt className="text-muted-foreground">{label}</dt>
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
      className={buttonSmall}
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
