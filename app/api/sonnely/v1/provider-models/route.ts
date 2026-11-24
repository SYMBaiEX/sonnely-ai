import { providerCatalog } from "@/lib/provider-models";
import { specializedModels } from "@/lib/specialized-models";
import { configuredProviders } from "@/lib/managed-access";

export function GET() {
  return Response.json({ ...providerCatalog, specializedModels, active_providers: configuredProviders() });
}
