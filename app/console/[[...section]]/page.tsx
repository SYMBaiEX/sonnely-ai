import { notFound } from "next/navigation";
import { ConsoleScreen } from "@/components/console";
import { adminAreas } from "@/lib/admin-areas";
import { computeFeatures, isComputeProduct } from "@/lib/compute-features";
import { computePlans } from "@/lib/compute";
import { models } from "@/lib/models";
import { intentsEmbedUrl } from "@/lib/intent-funding";
import { configuredProviders, nearIntentsFundingEnabled, solFundingEnabled } from "@/lib/managed-access";
import { providerRoute } from "@/lib/provider-catalog";

const sections = [
  "chat",
  "models",
  "keys",
  "usage",
  "blackboxes",
  "dry-docks",
  "billing",
  "referrals",
  "support",
  "settings",
  "admin",
] as const;
export type Section = (typeof sections)[number];
type Props = {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ model?: string; run?: string }>;
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
  const [{ section }, { model, run }] = await Promise.all([params, searchParams]);
  const name = section?.[0] ?? "chat";
  const adminArea = name === "admin" && section?.[1] ? section[1] : undefined;
  const badDepth =
    (section && section.length > 2) ||
    (section &&
      section.length === 2 &&
      !(name === "admin" && adminAreas.includes(adminArea as (typeof adminAreas)[number])));
  if (badDepth || !sections.includes(name as Section)) notFound();
  const features = computeFeatures();
  if (isComputeProduct(name) && !features[name]) notFound();
  const availableProviders = configuredProviders();
  const initial =
    models.find((item) => item.id === model) ??
    models.find((item) => availableProviders.some((id) => providerRoute(item, id))) ??
    models[0];
  const initialProvider = availableProviders.find((id) => providerRoute(initial, id)) ?? initial.provider;
  return (
    <ConsoleScreen
      section={name as Section}
      features={features}
      solFunding={name === "billing" && solFundingEnabled()}
      intentsFunding={
        name === "billing" && nearIntentsFundingEnabled()
          ? { widgetUrl: intentsEmbedUrl(process.env.SONNELY_INTENTS_WIDGET_URL) }
          : undefined
      }
      initialModel={initial.id}
      restoreConversation={model === undefined}
      initialRun={typeof run === "string" && /^[a-z0-9]{20,80}$/.test(run) ? run : undefined}
      initialProvider={initialProvider}
      availableProviders={availableProviders}
    />
  );
}
