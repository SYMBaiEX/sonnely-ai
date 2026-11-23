import { notFound } from "next/navigation";
import { ConsoleScreen } from "@/components/console";
import { nearCatalog } from "@/lib/near-catalog";
import { computeFeatures, isComputeProduct } from "@/lib/compute-features";
import { computePlans } from "@/lib/compute";
import { models } from "@/lib/models";
import { intentsEmbedUrl } from "@/lib/intent-funding";
import { configuredProviders, nearIntentsFundingEnabled } from "@/lib/managed-access";
import { providerIds, providerRoute } from "@/lib/provider-catalog";

const sections = [
  "chat",
  "models",
  "keys",
  "usage",
  "blackboxes",
  "dry-docks",
  "billing",
  "referrals",
  "settings",
  "admin",
] as const;
export type Section = (typeof sections)[number];
type Props = {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ model?: string; provider?: string; run?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { section } = await params;
  const name = section?.[0] ?? "chat";
  if (name === "blackboxes" || name === "dry-docks") return { title: computePlans[name].title + " Console" };
  return {
    title: sections.includes(name as Section)
      ? name[0].toUpperCase() + name.slice(1) + " Console"
      : "Console",
  };
}

export default async function ConsolePage({ params, searchParams }: Props) {
  const [{ section }, { model, provider, run }] = await Promise.all([params, searchParams]);
  const name = section?.[0] ?? "chat";
  if ((section && section.length > 1) || !sections.includes(name as Section)) notFound();
  const features = computeFeatures();
  if (isComputeProduct(name) && !features[name]) notFound();
  const availableProviders = configuredProviders();
  const initial =
    models.find((item) => item.id === model) ??
    models.find((item) => availableProviders.some((id) => providerRoute(item, id))) ??
    models[0];
  const pinnedProvider = providerIds.find((id) => id === provider);
  const initialProvider =
    pinnedProvider ?? availableProviders.find((id) => providerRoute(initial, id)) ?? initial.provider;
  return (
    <ConsoleScreen
      section={name as Section}
      features={features}
      providerCatalog={name === "models" ? await nearCatalog() : undefined}
      intentsFunding={
        name === "billing" && nearIntentsFundingEnabled()
          ? { widgetUrl: intentsEmbedUrl(process.env.SONNELY_INTENTS_WIDGET_URL) }
          : undefined
      }
      initialModel={initial.id}
      restoreConversation={model === undefined && provider === undefined}
      initialRun={typeof run === "string" && /^[a-z0-9]{20,80}$/.test(run) ? run : undefined}
      initialProvider={initialProvider}
      availableProviders={availableProviders}
    />
  );
}
