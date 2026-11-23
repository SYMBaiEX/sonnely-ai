import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { auth } from "./access";
import { computeFeatures } from "../lib/compute-features";
import { boatCapacity } from "./computeProvider";

export const status = action({
  args: auth,
  returns: v.object({
    state: v.string(),
    enabled: v.boolean(),
    active: v.union(v.number(), v.null()),
    limit: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.compute.authorizeCapacityRead, args);
    const enabled = computeFeatures()["dry-docks"];
    const unavailable = { enabled, active: null, limit: null };
    if (!enabled) return { ...unavailable, state: "disabled" };
    if (!process.env.BOAT_API_KEY) return { ...unavailable, state: "unconfigured" };
    try {
      return { ...(await boatCapacity()), enabled };
    } catch {
      return { ...unavailable, state: "unavailable" };
    }
  },
});
