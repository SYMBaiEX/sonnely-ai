import { v } from "convex/values";
import { blackboxDiskSizes, blackboxMachineIds } from "../lib/blackbox-options";

export const kind = v.union(v.literal("blackboxes"), v.literal("dry-docks"));
export const result = v.union(
  v.literal("completed"),
  v.literal("failed"),
  v.literal("stopped"),
  v.literal("expired"),
);
export const spec = v.union(
  v.object({
    kind: v.literal("blackboxes"),
    image: v.string(),
    port: v.number(),
    machine: v.optional(v.union(...blackboxMachineIds.map((value) => v.literal(value)))),
    disk: v.optional(v.union(...blackboxDiskSizes.map((value) => v.literal(value)))),
  }),
  v.object({ kind: v.literal("dry-docks"), repository: v.string(), revision: v.string() }),
);

export const computeProgress = {
  phase: v.union(
    v.literal("queued"),
    v.literal("provisioning"),
    v.literal("running"),
    v.literal("teardown"),
    v.literal("settled"),
  ),
  providerId: v.optional(v.string()),
  launchAttemptAt: v.optional(v.number()),
  commandAttemptAt: v.optional(v.number()),
  commitToken: v.optional(v.string()),
  composeHash: v.optional(v.string()),
  evidence: v.optional(v.id("_storage")),
  evidenceAt: v.optional(v.number()),
  endpoint: v.optional(v.string()),
  deletionId: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  scheduledDelete: v.optional(v.boolean()),
  processId: v.optional(v.number()),
  log: v.optional(v.string()),
  artifact: v.optional(v.id("_storage")),
  message: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  workAt: v.optional(v.number()),
  teardownAt: v.optional(v.number()),
  settledAt: v.optional(v.number()),
  meteredSeconds: v.optional(v.number()),
  meteredBase: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  result: v.optional(result),
};
