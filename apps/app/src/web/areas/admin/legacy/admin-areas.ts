export const adminAreas = [
  "overview",
  "customers",
  "support",
  "traces",
  "gateway",
  "operators",
  "payouts",
  "privacy-rings",
  "analytics",
  "logs",
] as const;
export type AdminArea = (typeof adminAreas)[number];
