"use client";

import { useTheme } from "fumadocs-ui/provider/base";
import { AmbientVisualizer, useAmbientMotion } from "@/components/ambient-motion";

export function DocsBackdrop() {
  const { resolvedTheme } = useTheme();
  const motion = useAmbientMotion();

  return (
    <div className="docs-backdrop" data-motion={motion ? "on" : "off"} aria-hidden="true">
      <div className="workspace-scene" />
      <AmbientVisualizer motion={motion} theme={resolvedTheme === "light" ? "light" : "dark"} />
    </div>
  );
}
