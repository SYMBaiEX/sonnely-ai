import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { address, billing, findMatchingPayment, mainnetMint, rpcCall, verifyCluster } from "./payments";
import { preparePaymentEnvelope } from "./payment-transaction";
import { getProviderCosts } from "./provider-billing";
import { backend, json, SonnelyError } from "./server";

const tokenBalance = z.object({
  value: z.array(
    z.object({
      account: z.object({
        data: z.object({
          parsed: z.object({
            info: z.object({ tokenAmount: z.object({ amount: z.string().regex(/^\d+$/) }) }),
          }),
        }),
      }),
    }),
  ),
});

async function treasuryBalance(rpc: string, treasury: string) {
  const balances = tokenBalance.safeParse(
    await rpcCall(rpc, "getTokenAccountsByOwner", [
      treasury,
      { mint: mainnetMint },
      { commitment: "finalized", encoding: "jsonParsed" },
    ]),
  );
  if (!balances.success) throw new SonnelyError("Treasury USDC balance is unavailable.", 503);
  return balances.data.value.reduce(
    (sum, entry) => sum + BigInt(entry.account.data.parsed.info.tokenAmount.amount),
    0n,
  );
}

export async function adminOverview(
  auth: { secret: string; session: string },
  db: ReturnType<typeof backend>["db"],
  since: number,
) {
  const data = await db.query(api.finance.overview, { ...auth, since });
  const { rpc, cluster, recipient } = billing();
  const [creditLiability, treasury, recovery, compute] = await Promise.allSettled([
    db.query(api.finance.payoutCoverage, auth),
    rpc && recipient && cluster === "mainnet"
      ? verifyCluster(rpc, cluster).then(() => treasuryBalance(rpc, recipient))
      : Promise.resolve(null),
    db.query(api.creditRecovery.queue, { ...auth, now: Date.now() }),
    db.query(api.compute.adminSummary, { ...auth, since }),
  ]);
  const treasuryMicros = treasury.status === "fulfilled" ? Number(treasury.value ?? NaN) : NaN;
  return json({
    ...data,
    compute: compute.status === "fulfilled" ? compute.value : null,
    creditRecovery: recovery.status === "fulfilled" ? recovery.value : null,
    creditLiability: creditLiability.status === "fulfilled" ? creditLiability.value : null,
    treasuryMicros: Number.isSafeInteger(treasuryMicros) ? treasuryMicros : null,
  });
}

export async function adminCrm(
  params: URLSearchParams,
  auth: { secret: string; session: string },
  db: ReturnType<typeof backend>["db"],
) {
  const cursor = z.string().max(4000).nullable().parse(params.get("cursor"));
  const page = { cursor, numItems: 30 };
  const search = z
    .string()
    .trim()
    .max(80)
    .parse(params.get("search") ?? "");
  const filter = params.get("filter") ?? "all";
  switch (params.get("view")) {
    case "customers":
      return json(await db.query(api.crm.customers, { ...auth, search, page }));
    case "customer": {
      const id = z.string().min(1).max(64).parse(params.get("id")) as Id<"accounts">;
      return json(await db.query(api.crm.customer, { ...auth, id }));
    }
    case "support": {
      const state = z.enum(["all", "open", "in_progress", "resolved"]).parse(filter);
      return json(await db.query(api.crm.tickets, { ...auth, state, page }));
    }
    case "traces": {
      const status = z.enum(["all", "pending", "complete", "failed", "unreported"]).parse(filter);
      return json(await db.query(api.crm.traces, { ...auth, status, search, page }));
    }
    default:
      throw new SonnelyError("Choose an admin view.", 404);
  }
}

export async function adminAction(
  task: string,
  raw: unknown,
  auth: { secret: string; session: string },
  db: ReturnType<typeof backend>["db"],
) {
  if (task === "admin-note") {
    const { account, note } = z
      .object({ account: z.string().min(1).max(64), note: z.string().trim().min(1).max(2000) })
      .parse(raw);
    await db.mutation(api.crm.addNote, { ...auth, account: account as Id<"accounts">, note });
    return json({ ok: true }, 201);
  }
  if (task === "admin-ticket") {
    const { id, ...fields } = z
      .object({
        id: z.string().min(1).max(64),
        state: z.enum(["open", "in_progress", "resolved"]),
        assignment: z.enum(["keep", "claim", "unassign"]),
      })
      .parse(raw);
    await db.mutation(api.crm.updateTicket, { ...auth, id: id as Id<"tickets">, ...fields });
    return json({ ok: true });
  }
  if (task === "admin-resolve-credit") {
    const { id, ...fields } = z
      .object({
        id: z.string().min(1).max(64),
        resolution: z.enum(["release", "settle"]),
        charged: z.number().int().safe().nonnegative(),
        evidence: z.string().trim().min(8).max(500),
      })
      .parse(raw);
    await db.mutation(api.creditRecovery.resolve, { ...auth, id: id as Id<"usage">, ...fields });
    return json({ ok: true });
  }
  if (task === "admin-reconcile") {
    const ids = await db.query(api.finance.pendingCosts, auth);
    const costs = ids.length ? await getProviderCosts(ids) : [];
    return json({ count: await db.mutation(api.finance.reconcile, { ...auth, costs }) });
  }
  if (task === "admin-open-payout") {
    return json({
      reference: await db.mutation(api.finance.openPayout, {
        ...auth,
        mint: mainnetMint,
        reference: bs58.encode(randomBytes(32)),
      }),
    });
  }

  const { reference, version } = z
    .object({ reference: address, version: z.literal("legacy").optional() })
    .parse(raw);
  const order = await db.query(api.finance.payoutDetails, { ...auth, reference });
  const { rpc, cluster, recipient } = billing();
  if (!rpc || cluster !== "mainnet" || order.treasury !== recipient || order.mint !== mainnetMint)
    throw new SonnelyError("Mainnet payout configuration is unavailable.", 503);
  await verifyCluster(rpc, cluster);
  if (task === "admin-confirm-payout") {
    const signature = await findMatchingPayment(rpc, order.treasury, order, "finalized");
    if (!signature) return json({ ok: false });
    await db.mutation(api.finance.confirmPayout, { ...auth, reference, signature });
    return json({ ok: true });
  }
  if (task === "admin-payout-transaction" && version === "legacy") {
    const profile = await db.query(api.sonnely.profile, auth);
    if (profile?.wallet !== order.treasury)
      throw new SonnelyError("Connect the treasury wallet to approve.", 403);
    // A finalized block height safely bounds expiry and prevents two live drafts for one payout.
    const height = z
      .number()
      .int()
      .nonnegative()
      .parse(await rpcCall(rpc, "getBlockHeight", [{ commitment: "finalized" }]));
    if (await findMatchingPayment(rpc, order.treasury, order, "confirmed"))
      throw new SonnelyError("The payout is already on chain. Check finality.", 409);
    const [liability, usdc] = await Promise.all([
      db.query(api.finance.payoutCoverage, auth),
      treasuryBalance(rpc, order.treasury),
    ]);
    if (liability === null || !Number.isSafeInteger(liability))
      throw new SonnelyError("Treasury coverage could not be verified.", 503);
    if (usdc < BigInt(liability) + BigInt(order.amount))
      throw new SonnelyError("The treasury needs more USDC to cover available credits and this payout.", 409);
    if (order.transaction && (order.lastValidBlockHeight ?? 0) >= height)
      return json({ transaction: order.transaction });
    const draft = await preparePaymentEnvelope(rpc, order.treasury, order, "legacy");
    return json({
      transaction: await db.mutation(api.finance.savePayoutTransaction, {
        ...auth,
        reference,
        ...draft,
        observedHeight: height,
      }),
    });
  }
  throw new SonnelyError("Unsupported admin action.");
}
