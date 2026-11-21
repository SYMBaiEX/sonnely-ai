import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { z } from "zod";
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
  const [creditLiability, treasury] = await Promise.allSettled([
    db.query(api.finance.payoutCoverage, auth),
    rpc && recipient && cluster === "mainnet"
      ? verifyCluster(rpc, cluster).then(() => treasuryBalance(rpc, recipient))
      : Promise.resolve(null),
  ]);
  const treasuryMicros = treasury.status === "fulfilled" ? Number(treasury.value ?? NaN) : NaN;
  return json({
    ...data,
    creditLiability: creditLiability.status === "fulfilled" ? creditLiability.value : null,
    treasuryMicros: Number.isSafeInteger(treasuryMicros) ? treasuryMicros : null,
  });
}

export async function adminAction(
  task: string,
  raw: unknown,
  auth: { secret: string; session: string },
  db: ReturnType<typeof backend>["db"],
) {
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
