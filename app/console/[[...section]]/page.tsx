import { notFound } from "next/navigation";
import { Console } from "@/components/console";
import { nearCatalog } from "@/lib/near-catalog";
import { models } from "@/lib/models";
import { managedProviderKey } from "@/lib/managed-access";

const sections = ["chat", "models", "keys", "usage", "billing", "referrals", "settings", "admin"] as const;
export type Section = (typeof sections)[number];
type Props = {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ model?: string; provider?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { section } = await params;
  const name = section?.[0] ?? "chat";
  return {
    title: sections.includes(name as Section)
      ? name[0].toUpperCase() + name.slice(1) + " Console"
      : "Console",
  };
}

export default async function ConsolePage({ params, searchParams }: Props) {
  const [{ section }, { model, provider }] = await Promise.all([params, searchParams]);
  const name = section?.[0] ?? "chat";
  if ((section && section.length > 1) || !sections.includes(name as Section)) notFound();
  const initial = models.find((item) => item.id === model) ?? models[0];
  const phala = Boolean(managedProviderKey("phala"));
  return (
    <Console
      section={name as Section}
      providerCatalog={name === "models" ? await nearCatalog() : undefined}
      initialModel={initial.id}
      initialProvider={provider === "phala" ? "phala" : "near-ai"}
      phala={phala}
    />
  );
}
