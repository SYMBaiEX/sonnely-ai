export type Season = "winter" | "evergreen";

const winterStart = Date.parse("2026-11-20T06:00:00Z");
const winterEnd = Date.parse("2027-01-01T06:00:00Z");

export function seasonAt(now: number): Season {
  return now >= winterStart && now < winterEnd ? "winter" : "evergreen";
}

export function applySeason(now = Date.now()) {
  document.documentElement.dataset.season = seasonAt(now);
}

applySeason();
window.addEventListener("pageshow", () => applySeason());
document.addEventListener("visibilitychange", () => applySeason());
