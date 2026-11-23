export function alertFallbackConfigured() {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(
    process.env.SONNELY_ALERT_FALLBACK_WEBHOOK ?? "",
  );
}

export async function sendAlertFallback(id: string, subject: string, text: string) {
  if (!alertFallbackConfigured()) return false;
  try {
    const response = await fetch(process.env.SONNELY_ALERT_FALLBACK_WEBHOOK!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: subject + "\n" + text + "\nReference " + id, link_names: false }),
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
    });
    return response.ok;
  } catch {
    return false;
  }
}
