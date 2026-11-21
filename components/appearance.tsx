"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

import { readTheme, themeKey, type Theme } from "@/lib/appearance";

const changeEvent = "sonnely:theme";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

export function useTheme() {
  return useSyncExternalStore(subscribe, readTheme, () => "dark" as const);
}

export function setTheme(theme: Theme) {
  localStorage.setItem(themeKey, theme);
  window.dispatchEvent(new Event(changeEvent));
}

export function ThemeSurface({ children, className }: { children: ReactNode; className: string }) {
  const theme = useTheme();
  useEffect(() => {
    if (theme === readTheme()) delete document.documentElement.dataset.initialTheme;
  }, [theme]);
  return (
    <div className={"theme-root " + className} data-theme={theme}>
      {children}
    </div>
  );
}

export function ThemeSwitch() {
  const theme = useTheme();
  function cycle() {
    const isLight =
      theme === "light" || (theme === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    setTheme(isLight ? "dark" : "light");
  }
  return (
    <button
      className="icon-button theme-switch"
      type="button"
      onClick={cycle}
      aria-label="Switch color theme"
    >
      <Sun className="theme-sun" size={18} aria-hidden />
      <Moon className="theme-moon" size={18} aria-hidden />
    </button>
  );
}
