import { models } from "@/lib/models";
import { configuredProviders } from "@/lib/managed-access";
import { listModelRoutes } from "@/lib/provider-catalog";

export function GET() {
  const providers = configuredProviders();
  return Response.json({
    object: "list",
    data: models.map((model) => ({
      id: model.id,
      object: "model",
      created: 0,
      owned_by: model.provider,
      tier: model.tier,
      privacy_route: model.privacyRoute,
      routes: listModelRoutes(model, providers),
    })),
  });
}
