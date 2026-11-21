import { notFound } from "next/navigation";
import { Console } from "@/components/console";
import { models } from "@/lib/models";

const sections = ["chat", "models", "keys", "usage", "billing", "referrals", "settings"] as const;
export type Section = (typeof sections)[number];
type Props = { params: Promise<{ section?: string[] }>; searchParams: Promise<{ model?: string }> };

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
  const [{ section }, { model }] = await Promise.all([params, searchParams]);
  const name = section?.[0] ?? "chat";
  if ((section && section.length > 1) || !sections.includes(name as Section)) notFound();
  return (
    <Console
      section={name as Section}
      initialModel={models.find((item) => item.id === model)?.id ?? models[0].id}
    />
  );
}
