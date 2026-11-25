export const adminAreas = [
  "overview",
  "customers",
  "support",
  "traces",
  "gateway",
  "operators",
  "privacy-rings",
  "analytics",
  "logs",
] as const;
export type AdminArea = (typeof adminAreas)[number];
