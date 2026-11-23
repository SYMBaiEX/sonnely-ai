import { providerIds, type ProviderId } from "./provider-catalog";

export function publicInference() {
  return process.env.SONNELY_PUBLIC_INFERENCE === "true";
}

export function nearIntentsFundingEnabled() {
  return process.env.SONNELY_NEAR_INTENTS_FUNDING === "true";
}

function providerPaused(provider: ProviderId) {
  return process.env.SONNELY_PAUSED_PROVIDERS?.split(",").some((item) => item.trim() === provider) ?? false;
}

export function managedProviderKey(provider: ProviderId = "near-ai") {
  if (providerPaused(provider)) return undefined;
  if (process.env.VERCEL_ENV === "production" && !publicInference()) {
    return undefined;
  }
  if (provider === "phala") return process.env.PHALA_AI_API_KEY?.trim() || undefined;
  if (provider === "tinfoil") return process.env.TINFOIL_API_KEY?.trim() || undefined;
  return process.env.NEAR_AI_API_KEY?.trim() || undefined;
}

export function configuredProviders() {
  return providerIds.filter((provider) => Boolean(managedProviderKey(provider)));
}
