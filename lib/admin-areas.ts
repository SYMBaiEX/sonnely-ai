export const adminAreas = [
  "overview",
  "customers",
  "support",
  "traces",
  "gateway",
  "operators",
  "analytics",
  "logs",
] as const;
export type AdminArea = (typeof adminAreas)[number];
