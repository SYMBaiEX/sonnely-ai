import { v } from "convex/values";
import { requestLogEndpoints, requestLogStatuses } from "../lib/request-logs";

export const requestEndpoint = v.union(...requestLogEndpoints.map((endpoint) => v.literal(endpoint)));
export const requestStatus = v.union(...requestLogStatuses.map((value) => v.literal(value)));
