import { z } from "zod";
import type { PrivacyRoute, ProviderModel } from "./model-privacy";
import snapshot from "./near-catalog-snapshot.json";

const catalogResponse = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        owned_by: z.string().min(1),
        input_modalities: z.array(z.string()),
        output_modalities: z.array(z.string()),
        context_length: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

const verifiedRoutes = new Map<string, { owner: string; route: PrivacyRoute }>(
  snapshot.models.map(({ id, owner, route }) => [id, { owner, route: route as PrivacyRoute }]),
);

function publishedRoute(id: string, owner: string): PrivacyRoute {
  const verified = verifiedRoutes.get(id);
  if (verified?.owner === owner) return verified.route;
  // The public API omits route labels. Unreviewed or changed routes need a catalog cross-check.
  return "unclassified";
}

export async function nearCatalog(): Promise<{
  models: ProviderModel[];
  privacyCheckedOn: string;
  snapshotDate?: string;
}> {
  try {
    const response = await fetch("https://cloud-api.near.ai/v1/models", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("NEAR catalog unavailable");
    const { data } = catalogResponse.parse(await response.json());
    return {
      privacyCheckedOn: snapshot.asOf,
      models: data.map(({ id, name, owned_by, input_modalities, output_modalities, context_length }) => ({
        id,
        name,
        owner: owned_by,
        inputs: input_modalities,
        outputs: output_modalities,
        context: context_length,
        route: publishedRoute(id, owned_by),
      })),
    };
  } catch {
    return {
      models: snapshot.models.map((model) => ({ ...model, route: model.route as PrivacyRoute })),
      privacyCheckedOn: snapshot.asOf,
      snapshotDate: snapshot.asOf,
    };
  }
}
