// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import snapshot from "./provider-model-snapshot.json";
import type { PrivacyRoute } from "./model-privacy.ts";

export const providerIds = ["near-ai", "phala", "tinfoil"] as const;
export type ProviderId = (typeof providerIds)[number];

export const providerNames: Record<ProviderId, string> = {
  "near-ai": "NEAR AI",
  phala: "Phala",
  tinfoil: "Tinfoil",
};

type ProviderModel = {
  id: string;
  name: string;
  route: PrivacyRoute;
  workload: string;
  context: number | null;
  pricing?: { input?: number; output?: number; cache?: number };
  chatId?: string;
  reasoningRequired?: boolean;
  imageUsd?: number;
  audioUsd?: number;
  requestUsd?: number;
};

export const providerCatalog = {
  asOf: snapshot.asOf,
  providers: snapshot.providers as Record<ProviderId, readonly ProviderModel[]>,
};

export const chatRoutes = providerIds.flatMap((provider) =>
  providerCatalog.providers[provider].flatMap((entry) => {
    const { chatId, pricing } = entry;
    return chatId && pricing?.input !== undefined && pricing.output !== undefined
      ? [
          {
            id: chatId,
            provider,
            name: entry.name,
            context: entry.context,
            privacyRoute: entry.route,
            upstreamModel: entry.id,
            input: pricing.input,
            output: pricing.output,
            cache: pricing.cache ?? pricing.input,
            reasoningRequired: entry.reasoningRequired,
          },
        ]
      : [];
  }),
);
