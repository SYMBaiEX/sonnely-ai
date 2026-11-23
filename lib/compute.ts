import { blackboxHourlyBase, blackboxSize } from "./blackbox-options";

export const computePlans = {
  blackboxes: {
    title: "Blackboxes",
    provider: "Confidential cloud",
    size: blackboxSize(),
    hourlyBase: blackboxHourlyBase(),
    unitSeconds: 60,
    minutes: [15, 30, 60, 120],
  },
  "dry-docks": {
    title: "Dry Docks",
    provider: "Boat",
    size: "2 vCPU · 4 GB RAM",
    hourlyBase: 18_000,
    unitSeconds: 1,
    minutes: [5, 10, 15],
  },
} as const;

export type ComputeKind = keyof typeof computePlans;
export const computeFee = 10_000;
export const computeMarkup = 25;
export const artifactLimit = 5 * 1024 * 1024;
export const computeRetention = 7 * 86_400_000;
export const imagePattern =
  /^(?:docker\.io|ghcr\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*){0,4}@sha256:[0-9a-f]{64}$/;
export const repositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
export const revisionPattern = /^[0-9a-f]{40}$/i;

export function computePrice(hourlyBase: number, unitSeconds: number, seconds: number) {
  const units = Math.ceil(seconds / unitSeconds);
  const base = Math.ceil((hourlyBase * units * unitSeconds) / 3600);
  const fee = units ? computeFee + Math.ceil((base * computeMarkup) / 100) : 0;
  return { base, fee, total: base + fee };
}

export const computeQuote = (kind: ComputeKind, minutes: number) =>
  computePrice(computePlans[kind].hourlyBase, computePlans[kind].unitSeconds, minutes * 60);
