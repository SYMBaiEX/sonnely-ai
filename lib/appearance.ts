export const themeKey = "sonnely.theme";
export const preferencesKey = "sonnely.preferences";
export const legacyThemeKey = "fathom.theme";
export const legacyPreferencesKey = "fathom.preferences";
export type Theme = "dark" | "light" | "system";

export function readTheme(): Theme {
  try {
    const stored =
      localStorage.getItem(themeKey) ??
      localStorage.getItem(legacyThemeKey) ??
      JSON.parse(localStorage.getItem(preferencesKey) ?? localStorage.getItem(legacyPreferencesKey) ?? "{}")
        .theme;
    if (stored === "light" || stored === "system") return stored;
  } catch {
    // The default appearance also covers blocked storage and malformed settings.
  }
  return "dark";
}

export const themeBeforePaint = `try {
  var theme = localStorage.getItem(${JSON.stringify(themeKey)}) ??
    localStorage.getItem(${JSON.stringify(legacyThemeKey)}) ??
    JSON.parse(localStorage.getItem(${JSON.stringify(preferencesKey)}) ??
      localStorage.getItem(${JSON.stringify(legacyPreferencesKey)}) ?? "{}").theme;
  if (theme === "light" || theme === "system") document.documentElement.dataset.initialTheme = theme;
} catch {}`;

// The holiday collection ends at midnight on January 1 in America/Chicago.
export const winterStart = Date.parse("2026-11-20T06:00:00Z");
export const winterEnd = Date.parse("2027-01-01T06:00:00Z");

export const seasonBeforePaint = `(() => {
  const start = ${winterStart};
  const end = ${winterEnd};
  let timer;
  function update() {
    clearTimeout(timer);
    const now = Date.now();
    const winter = now >= start && now < end;
    document.documentElement.dataset.season = winter ? "winter" : "evergreen";
    const next = now < start ? start : winter ? end : null;
    if (next !== null) timer = setTimeout(update, Math.min(next - now, 2147483647));
  }
  update();
  window.addEventListener("pageshow", update);
  document.addEventListener("visibilitychange", update);
})();`;
