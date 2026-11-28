/* eslint-disable better-tailwindcss/no-unknown-classes -- shared shell surface uses the migrated shell class contract */
import type { ReactNode } from "react";
import { AmbientVisualizer } from "./motion.tsx";
import { useAmbientMotion, useTheme, type Theme } from "./theme.tsx";

export interface ShellSurfaceProps {
  area: "site" | "console";
  skipHref: string;
  className?: string;
  children: ReactNode;
}

export function ShellSurface({ area, skipHref, className = "", children }: ShellSurfaceProps) {
  const theme: Theme = useTheme();
  const motion = useAmbientMotion();
  return (
    <div className={"shell-root" + (className ? " " + className : "")} data-area={area} data-theme={theme} data-motion={motion ? "on" : "off"}>
      <a href={skipHref} className="skip">
        {area === "console" ? "Skip to workspace" : "Skip to content"}
      </a>
      <div className="workspace-scene" aria-hidden="true" />
      {children}
      <AmbientVisualizer motion={motion} theme={theme} />
    </div>
  );
}
