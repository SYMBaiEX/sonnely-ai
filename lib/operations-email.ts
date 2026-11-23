import { z } from "zod";

const mailResult = z.object({
  state: z.enum(["delivered", "accepted", "failed", "retry", "unconfirmed"]),
  messageId: z.string().min(1).max(160).optional(),
  code: z
    .string()
    .regex(/^E_[A-Z0-9_]{1,60}$/)
    .optional(),
});

export async function sendOperationsEmail(
  id: string,
  subject: string,
  text: string,
): Promise<z.infer<typeof mailResult>> {
  const origin = process.env.SONNELY_MAIL_BRIDGE_URL;
  const token = process.env.SONNELY_MAIL_BRIDGE_TOKEN;
  if (!origin || !/^https:\/\/sonnely-ops-mail\.[a-z0-9-]+\.workers\.dev$/.test(origin) || !token) {
    return { state: "failed", code: "E_TRANSPORT_UNCONFIGURED" };
  }
  try {
    const response = await fetch(origin + "/send", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ id, subject, text }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    const result = mailResult.safeParse(response.ok ? await response.json() : null);
    return result.success ? result.data : { state: "unconfirmed" };
  } catch {
    return { state: "unconfirmed" };
  }
}
