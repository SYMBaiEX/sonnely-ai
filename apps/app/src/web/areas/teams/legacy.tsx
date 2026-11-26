/* eslint-disable better-tailwindcss/no-unknown-classes -- this wrapper intentionally uses the migrated workspace class name */
import type { ReactNode } from "react";
import "../site/site.css";
import "./workspace-legacy.css";

export {
  CopyButton,
  WorkspaceHeading,
  creditBalance,
  creditDecimal,
  parseCreditAmount,
  shorten,
} from "../console/bits.tsx";

export function WorkspaceLegacy({ children }: { children: ReactNode }) {
  return <div className="workspace-legacy">{children}</div>;
}
