import { ConvexError } from "convex/values";
import { z } from "zod";
import {
  agentCapabilities,
  providerIds,
  providerRoute,
  type Model,
  type ProviderId,
} from "./provider-catalog";
import { managedProviderKey } from "./managed-access";
import { requestCharge } from "./pricing";
import { SonnelyError } from "./sonnely-error";

export const providerPolicy = z
  .strictObject({
    only: z.array(z.enum(providerIds)).min(1).max(providerIds.length),
    allow_fallbacks: z.boolean().optional(),
  })
  .refine(
    ({ only, allow_fallbacks }) =>
      new Set(only).size === only.length && (allow_fallbacks === true ? only.length > 1 : only.length === 1),
  );

export function providerAtCapacity(error: unknown) {
  return (
    error instanceof ConvexError &&
    (error.data === "Provider concurrency limit reached. Try again shortly." ||
      error.data === "Provider daily reservation limit reached.")
  );
}

export function completionRoutes(
  model: Model,
  policy: z.infer<typeof providerPolicy> | undefined,
  requirements: { tools: boolean; structured: boolean; bytes: number; maxTokens: number; maxCost?: number },
) {
  const ordered = policy?.only ?? [model.provider];
  const fallback = policy?.allow_fallbacks === true;
  const agentFeatures = process.env.SONNELY_AGENT_CAPABILITIES === "true";
  let lastError: SonnelyError | undefined;
  const candidates = ordered.flatMap((provider) => {
    const route = providerRoute(model, provider);
    const capabilities = agentCapabilities(model, provider, agentFeatures);
    const key = managedProviderKey(provider);
    const estimate = route && requestCharge(route, requirements.bytes + 256, 0, requirements.maxTokens);
    if (!route) lastError = new SonnelyError("The requested model is unavailable on this provider.", 404);
    else if (fallback && route.privacyRoute !== "private-tee")
      lastError = new SonnelyError("Private failover requires a Private TEE route.", 400);
    else if (requirements.tools && !capabilities.tools)
      lastError = new SonnelyError("Tool calling is unavailable on this route. Check /v1/models.", 400);
    else if (requirements.structured && !capabilities.structured_outputs)
      lastError = new SonnelyError(
        "Structured outputs are unavailable on this route. Check /v1/models.",
        400,
      );
    else if (!key) lastError = new SonnelyError("Managed inference is awaiting provider activation.", 503);
    else if (requirements.maxCost !== undefined && estimate! > requirements.maxCost)
      lastError = new SonnelyError("The estimated reservation exceeds max_cost_microusd.", 400);
    else return [{ provider, route, key, estimate: estimate! }];
    return [];
  });
  if (!candidates.length) {
    if (!fallback && lastError) throw lastError;
    // A policy never routes outside the explicit list, even when all candidates are unavailable.
    throw new SonnelyError(
      "No listed Private TEE provider meets this request's availability, capabilities, and cost limits.",
      lastError?.status === 503 ? 503 : 400,
    );
  }
  return candidates;
}
