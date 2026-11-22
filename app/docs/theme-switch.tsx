"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "fumadocs-ui/provider/base";

export function DocsThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const light = resolvedTheme === "light";
  return (
    <button
      className="theme-switch"
      type="button"
      role="switch"
      aria-label="Switch color theme"
      aria-checked={light}
      data-light={light}
      suppressHydrationWarning
      onClick={() => setTheme(light ? "dark" : "light")}
    >
      <Moon size={15} aria-hidden="true" />
      <Sun size={15} aria-hidden="true" />
    </button>
  );
}
