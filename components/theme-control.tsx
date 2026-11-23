import { Moon, Sun } from "lucide-react";

export function ThemeControl({ light, toggle }: { light: boolean; toggle: () => void }) {
  return (
    <button
      className="theme-switch"
      type="button"
      role="switch"
      aria-label="Switch color theme"
      aria-checked={light}
      data-light={light}
      suppressHydrationWarning
      onClick={toggle}
    >
      <span className="theme-switch-thumb" aria-hidden="true" />
      <span className="theme-switch-icon theme-switch-moon" aria-hidden="true">
        <Moon size={16} />
      </span>
      <span className="theme-switch-icon theme-switch-sun" aria-hidden="true">
        <Sun size={17} />
      </span>
    </button>
  );
}
