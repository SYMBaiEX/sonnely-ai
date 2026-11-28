/* eslint-disable better-tailwindcss/no-unknown-classes -- shared shell navigation uses the migrated shell class contract */
import type { RefObject } from "react";

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
