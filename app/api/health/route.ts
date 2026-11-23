import { serviceHealth } from "@/lib/health";
import { json } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const health = await serviceHealth();
  return json(health, health.status === "ok" ? 200 : 503);
}
