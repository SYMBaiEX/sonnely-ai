"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { address, findMatchingPayment, verifyCluster } from "../lib/payments";

const sweepResult = v.object({
  mode: v.string(),
  checked: v.number(),
  credited: v.number(),
  failures: v.number(),
});

export const sweep = internalAction({
  args: {},
  returns: sweepResult,
  handler: async (ctx): Promise<Infer<typeof sweepResult>> => {
    const rpc = process.env.SOLANA_RPC_URL;
    const treasury = process.env.SONNELY_TREASURY_WALLET;
    if (!rpc || !treasury || !address.safeParse(treasury).success)
      return { mode: "unconfigured", checked: 0, credited: 0, failures: 0 };

    try {
      await verifyCluster(rpc, "mainnet");
    } catch {
      await ctx.runMutation(internal.recoveryData.recordHealth, { failures: 1 });
      return { mode: "rpc_unavailable", checked: 0, credited: 0, failures: 1 };
    }

    const now = Date.now();
    const orders = await ctx.runQuery(internal.recoveryData.pending, { treasury, now });
    let credited = 0;
    let failures = 0;
    for (let offset = 0; offset < orders.length; offset += 8) {
      const results = await Promise.allSettled(
        orders.slice(offset, offset + 8).map(async (order) => {
          // Keep older drafts recoverable while checking recent payments more frequently.
          const nextCheckAt = now + (now - order.created < 3_600_000 ? 120_000 : 3_600_000);
          try {
            const signature = await findMatchingPayment(rpc, order.wallet, order, "finalized");
            return await ctx.runMutation(internal.recoveryData.applyResult, {
              id: order.id,
              nextCheckAt,
              ...(signature ? { signature } : {}),
            });
          } catch (error) {
            await ctx.runMutation(internal.recoveryData.applyResult, { id: order.id, nextCheckAt });
            throw error;
          }
        }),
      );
      for (const result of results) {
        if (result.status === "rejected") failures++;
        else if (result.value) credited++;
      }
    }
    await ctx.runMutation(internal.recoveryData.recordHealth, { failures });
    return { mode: "mainnet", checked: orders.length, credited, failures };
  },
});
