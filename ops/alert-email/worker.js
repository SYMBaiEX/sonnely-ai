import { operationsBearer, validOperationsToken } from "../../lib/operations-auth";

async function deliver(env, message) {
  let inboxRetry = false;
  if (env.SONNELY_INBOX_TOKEN) {
    try {
      const response = await env.SONNELY_INBOX.fetch("https://sonnely-inbox.internal/deliver", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.SONNELY_INBOX_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (!response.ok) throw new Error("Inbox delivery transport failed.");
      const result = await response.json();
      if (result.state === "delivered") return result;
      if (!env.SONNELY_MAIL_TO) return result;
      inboxRetry = result.state === "retry";
    } catch {
      inboxRetry = true;
    }
  }
  if (!env.SONNELY_MAIL_TO) {
    return inboxRetry
      ? { state: "retry", code: "E_INBOX_TEMPORARY" }
      : { state: "failed", code: "E_RECIPIENT_NOT_CONFIGURED" };
  }
  try {
    const result = await env.EMAIL.send({
      to: env.SONNELY_MAIL_TO,
      from: env.SONNELY_MAIL_FROM,
      subject: message.subject,
      text: message.text,
    });
    return { state: "accepted", messageId: result.messageId };
  } catch (error) {
    const code =
      typeof error?.code === "string" && /^E_[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : undefined;
    if (code === "E_RATE_LIMIT_EXCEEDED") return { state: "retry", code };
    if (inboxRetry) return { state: "retry", code: code ?? "E_INBOX_TEMPORARY" };
    return { state: code ? "failed" : "unconfirmed", code };
  }
}

async function healthOk() {
  try {
    const response = await fetch("https://sonnely.com/api/health", {
      headers: { "User-Agent": "Sonnely-Operations", Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const health = await response.json();
    const probes = Object.values(health.probes ?? {});
    return (
      health.status === "ok" &&
      probes.length === 3 &&
      probes.every((state) => state === "ok" || state === "disabled")
    );
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/send") {
      return new Response(null, { status: 404 });
    }
    const token = operationsBearer(request.headers.get("Authorization"));
    if (!validOperationsToken(token, env.SONNELY_MAIL_BRIDGE_TOKEN)) {
      return new Response(null, { status: 401 });
    }
    const raw = await request.text();
    if (raw.length > 2048) return new Response(null, { status: 413 });
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (
      !message ||
      typeof message.id !== "string" ||
      !/^[a-z0-9]{20,64}$/.test(message.id) ||
      typeof message.subject !== "string" ||
      !message.subject.startsWith("[Sonnely] ") ||
      message.subject.length > 180 ||
      /[\r\n]/.test(message.subject) ||
      typeof message.text !== "string" ||
      message.text.length > 1200
    ) {
      return new Response(null, { status: 400 });
    }
    const { id, subject, text } = message;
    return Response.json(await deliver(env, { id, subject, text }));
  },

  async scheduled(event, env) {
    if (env.SONNELY_HEARTBEAT_ENABLED !== "true" || (await healthOk()) || (await healthOk())) return;
    const hour = Math.floor(event.scheduledTime / 3_600_000);
    const id = "sonnelyhealthcheck" + String(hour).padStart(10, "0");
    const result = await deliver(env, {
      id,
      subject: "[Sonnely] External health check failed",
      text: "Two Cloudflare checks could not confirm gateway and provider health. Review https://sonnely.com/status",
    });
    if (result.state !== "accepted" && result.state !== "delivered")
      throw new Error("External health alert delivery was not confirmed.");
  },
};
