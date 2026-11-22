import { operationsBearer, validOperationsToken } from "../../lib/operations-auth";

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
    if (env.SONNELY_INBOX_TOKEN) {
      const { id, subject, text } = message;
      try {
        return Response.json(await env.SONNELY_INBOX.deliver(env.SONNELY_INBOX_TOKEN, { id, subject, text }));
      } catch {
        return Response.json({ state: "retry", code: "E_INBOX_TEMPORARY" });
      }
    }
    if (!env.SONNELY_MAIL_TO) {
      return Response.json({ state: "failed", code: "E_RECIPIENT_NOT_CONFIGURED" });
    }
    try {
      const result = await env.EMAIL.send({
        to: env.SONNELY_MAIL_TO,
        from: env.SONNELY_MAIL_FROM,
        subject: message.subject,
        text: message.text,
      });
      return Response.json({ state: "accepted", messageId: result.messageId });
    } catch (error) {
      const code =
        typeof error?.code === "string" && /^E_[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : undefined;
      const state = code === "E_RATE_LIMIT_EXCEEDED" ? "retry" : code ? "failed" : "unconfirmed";
      return Response.json({ state, code });
    }
  },
};
