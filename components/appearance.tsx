"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { readTheme, themeKey, type Theme } from "@/lib/appearance";

import { AmbientVisualizer, useAmbientMotion } from "./ambient-motion";
import { ThemeControl } from "./theme-control";

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
  const motion = useAmbientMotion();
  useEffect(() => {
    if (theme === readTheme()) delete document.documentElement.dataset.initialTheme;
  }, [theme]);
  return (
    <div className={"theme-root " + className} data-theme={theme} data-motion={motion ? "on" : "off"}>
      <div className="workspace-scene" aria-hidden="true" />
      {children}
      <AmbientVisualizer motion={motion} theme={theme} />
    </div>
  );
}

export function ThemeSwitch() {
  const theme = useTheme();
  const [systemLight, setSystemLight] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystemLight(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const light = theme === "light" || (theme === "system" && systemLight);
  return <ThemeControl light={light} toggle={() => setTheme(light ? "dark" : "light")} />;
}
