export const themeKey = "fathom.theme";
export const preferencesKey = "fathom.preferences";
export type Theme = "dark" | "light" | "system";

export function readTheme(): Theme {
  try {
    const stored =
      localStorage.getItem(themeKey) ?? JSON.parse(localStorage.getItem(preferencesKey) || "{}").theme;
    if (stored === "light" || stored === "system") return stored;
  } catch {
    // The default appearance also covers blocked storage and malformed settings.
  }
  return "dark";
}

export const themeBeforePaint = `try {
  var theme = localStorage.getItem(${JSON.stringify(themeKey)}) ??
    JSON.parse(localStorage.getItem(${JSON.stringify(preferencesKey)}) || "{}").theme;
  if (theme === "light" || theme === "system") document.documentElement.dataset.initialTheme = theme;
} catch {}`;
