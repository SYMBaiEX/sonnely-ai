import { v } from "convex/values";
import { requestLogEndpoints, requestLogStatuses } from "../lib/request-logs";
import { providerIds } from "../lib/provider-models";

export const requestEndpoint = v.union(...requestLogEndpoints.map((endpoint) => v.literal(endpoint)));
export const requestStatus = v.union(...requestLogStatuses.map((value) => v.literal(value)));
export const requestProvider = v.union(...providerIds.map((value) => v.literal(value)));
export const providerRejection = v.object({
  provider: requestProvider,
  model: v.string(),
  startedAt: v.number(),
  endedAt: v.number(),
  httpStatus: v.literal(429),
});
