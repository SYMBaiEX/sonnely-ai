/* eslint-disable better-tailwindcss/no-unknown-classes -- shared shell navigation uses the migrated shell class contract */
// spec/app/nav.md, "Story: Move around"
import { createContext, use, type RefObject } from "react";

export type OpenPath = (path: string) => void;

export const NavigationContext = createContext<OpenPath | null>(null);

export function useOpenPath() {
  const openPath = use(NavigationContext);
  if (!openPath) throw new Error("navigation actions render inside App");
  return openPath;
}

export function MobileMenuButton({
  open,
  controls,
  label,
  className = "",
  buttonRef,
  onClick,
}: {
  open: boolean;
  controls: string;
  label: string;
  className?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={"mobile-menu-control" + (className ? " " + className : "")}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={(open ? "Close " : "Open ") + label}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <span className="mobile-menu-glyph" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
