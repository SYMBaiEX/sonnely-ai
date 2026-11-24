import { providerCatalog } from "@/lib/provider-models";
import { realtimeModel, specializedModels } from "@/lib/specialized-models";
import { configuredProviders } from "@/lib/managed-access";

export function GET() {
  return Response.json({
    ...providerCatalog,
    specializedModels,
    realtimeModel,
    active_providers: configuredProviders(),
  });
}
