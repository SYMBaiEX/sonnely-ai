import type { ProviderId } from "./provider-models";
import { specializedModels, type SpecializedEndpoint } from "./specialized-models";

export const requestLogStatuses = ["pending", "complete", "failed", "unreported"] as const;
export type UsageStatus = (typeof requestLogStatuses)[number];

export const requestLogEndpoints = [
  "chat/completions",
  ...(Object.keys(specializedModels) as SpecializedEndpoint[]),
  "realtime",
] as const;
export type RequestLogEndpoint = (typeof requestLogEndpoints)[number];

export const requestLogPageSize = 50;

export type RequestLogRow = {
  id: string;
  time: number;
  keyName: string;
  model: string;
  provider: ProviderId;
  providerRejections?: {
    provider: ProviderId;
    model: string;
    startedAt: number;
    endedAt: number;
    httpStatus: 429;
  }[];
  input: number;
  output: number;
  cost: number;
  status: UsageStatus;
  endpoint?: RequestLogEndpoint;
  providerRequest?: string;
  providerStatus?: number;
  outcome?: string;
  settledAt?: number;
  durationMs?: number;
  providerDurationMs?: number;
  timeToFirstTokenMs?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  stream?: boolean;
};

export type RequestLogPage = {
  wallet: string;
  rows: RequestLogRow[];
  nextCursor: string | null;
};
