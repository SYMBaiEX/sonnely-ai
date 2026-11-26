// spec/app/console/logs.md, "Story: Review request activity"

export const providerIds = ["near-ai", "phala", "tinfoil"] as const;
export type ProviderId = (typeof providerIds)[number];
export const providerNames: Record<string, string> = { "near-ai": "NEAR AI", phala: "Phala", tinfoil: "Tinfoil" };
