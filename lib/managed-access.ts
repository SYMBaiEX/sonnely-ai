import { providerIds, type ProviderId } from "./provider-catalog";

export function publicInference() {
  return process.env.SONNELY_PUBLIC_INFERENCE === "true";
}

export function pilotWallet() {
  return publicInference() ? undefined : process.env.SONNELY_PILOT_WALLET?.trim() || undefined;
}

export function allowedInPilot(wallet?: string) {
  const allowed = pilotWallet();
  return !allowed || allowed === wallet;
}

export function managedProviderKey(provider: ProviderId = "near-ai") {
  if (process.env.VERCEL_ENV === "production" && !pilotWallet() && !publicInference()) {
    return undefined;
  }
  if (provider === "phala") return process.env.PHALA_AI_API_KEY?.trim() || undefined;
  if (provider === "tinfoil") return process.env.TINFOIL_API_KEY?.trim() || undefined;
  return process.env.NEAR_AI_API_KEY;
}

export function configuredProviders() {
  return providerIds.filter((provider) => provider === "near-ai" || Boolean(managedProviderKey(provider)));
}
