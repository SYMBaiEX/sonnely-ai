/* eslint-disable better-tailwindcss/no-unknown-classes -- shared theme control uses the migrated shell class contract */
import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

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
