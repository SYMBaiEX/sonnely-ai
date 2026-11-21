import { api } from "@/convex/_generated/api";
import { backend } from "./server";
import { billing } from "./payments";
import { managedProviderKey, pilotWallet, publicInference } from "./managed-access";

export async function serviceHealth() {
  const payment = billing();
  const mainnet = payment.paymentVerificationEnabled && payment.cluster === "mainnet";
  const mode = publicInference()
    ? "public"
    : pilotWallet()
      ? "pilot"
      : managedProviderKey()
        ? "development"
        : "disabled";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let accountService = false;
  let depositRecovery = false;
  try {
    const { db, secret } = backend();
    const recovery = await Promise.race([
      db.query(api.recoveryData.health, { secret }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Account service timed out")), 4_000);
      }),
    ]);
    accountService = true;
    depositRecovery =
      recovery !== null && recovery.failures === 0 && Date.now() - recovery.checkedAt < 360_000;
  } catch {
    // Status is public. Return component states without deployment or RPC credentials.
  } finally {
    clearTimeout(timeout);
  }
  const checks = {
    accountService,
    providerConfigured: Boolean(managedProviderKey()),
    mainnetPaymentsConfigured: mainnet,
    depositRecovery,
  };
  return {
    service: "sonnely-solana",
    status: accountService && checks.providerConfigured && mainnet && depositRecovery ? "ok" : "degraded",
    mode,
    checks,
    checkedAt: new Date().toISOString(),
  };
}
