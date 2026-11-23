"use client";

import { useTheme } from "fumadocs-ui/provider/base";
import { ThemeControl } from "@/components/theme-control";

export function DocsThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const light = resolvedTheme === "light";
  return <ThemeControl light={light} toggle={() => setTheme(light ? "dark" : "light")} />;
}
