import type { ReactNode } from "react";
import { computeFeatures } from "@/lib/compute-features";
import { ConsoleShell } from "@/components/console";
import "./console-design.css";
import "./playground.css";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell features={computeFeatures()}>{children}</ConsoleShell>;
}
