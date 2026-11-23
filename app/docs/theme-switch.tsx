"use client";

import { useEffect, useState } from "react";
import { useTheme } from "fumadocs-ui/provider/base";
import { ThemeControl } from "@/components/theme-control";

export function DocsThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const light = mounted && resolvedTheme === "light";
  return <ThemeControl light={light} toggle={() => setTheme(light ? "dark" : "light")} />;
}
