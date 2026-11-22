import { api } from "@/convex/_generated/api";
import { backend } from "./server";
import { billing } from "./payments";
import { configuredProviders, publicInference } from "./managed-access";
import { providerIds } from "./provider-catalog";

function readProviderHealth() {
  const { db, secret } = backend();
  return db.query(api.operations.providerHealth, { secret });
}

export async function serviceHealth() {
  const payment = billing();
  const mainnet = payment.paymentVerificationEnabled && payment.cluster === "mainnet";
  const providers = configuredProviders();
  const mode = publicInference() ? "public" : providers.length ? "development" : "disabled";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let accountService = false;
  let depositRecovery = false;
  let providerStatus: Awaited<ReturnType<typeof readProviderHealth>> = null;
  try {
    const { db, secret } = backend();
    const [recovery, providers] = await Promise.race([
      Promise.all([db.query(api.recoveryData.health, { secret }), readProviderHealth().catch(() => null)]),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Account service timed out")), 4_000);
      }),
    ]);
    accountService = true;
    providerStatus = providers;
    depositRecovery =
      recovery !== null && recovery.failures === 0 && Date.now() - recovery.checkedAt < 360_000;
  } catch {
    // Status is public. Return component states without deployment or RPC credentials.
  } finally {
    clearTimeout(timeout);
  }
  const checks = {
    accountService,
    providerConfigured: providers.length > 0,
    phalaConfigured: providers.includes("phala"),
    tinfoilConfigured: providers.includes("tinfoil"),
    mainnetPaymentsConfigured: mainnet,
    depositRecovery,
  };
  const fresh = providerStatus && Date.now() - providerStatus.checkedAt < 12 * 60_000;
  const probes = Object.fromEntries(
    providerIds.map((provider) => [
      provider,
      !providers.includes(provider)
        ? "disabled"
        : fresh
          ? (providerStatus?.providers?.find((check) => check.provider === provider)?.state ?? "unverified")
          : "unverified",
    ]),
  );
  return {
    probes,
    service: "sonnely-solana",
    status:
      accountService &&
      checks.providerConfigured &&
      mainnet &&
      depositRecovery &&
      Object.values(probes).every((state) => state === "ok" || state === "disabled")
        ? "ok"
        : "degraded",
    mode,
    checks,
    checkedAt: new Date().toISOString(),
  };
}
