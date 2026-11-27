export const adminAreas = [
  "overview",
  "customers",
  "support",
  "traces",
  "operators",
  "payouts",
  "analytics",
  "logs",
] as const;
export type AdminArea = (typeof adminAreas)[number];
