import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/console";
import "./console-design.css";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
