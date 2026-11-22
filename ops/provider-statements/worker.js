import { operationsBearer, validOperationsToken } from "../../lib/operations-auth";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const maxStatementBytes = 128_000;

export default {
  async fetch(request, env) {
    if (request.method !== "GET" || new URL(request.url).pathname !== "/statements") {
      return new Response(null, { status: 404, headers });
    }

    const token = operationsBearer(request.headers.get("Authorization"));
    if (!validOperationsToken(token, env.SONNELY_STATEMENT_FEED_TOKEN)) {
      return new Response(null, { status: 401, headers });
    }

    const statements = await env.STATEMENTS.get("statements.json");
    if (!statements) return Response.json([], { headers });
    if (statements.size > maxStatementBytes) {
      await statements.body.cancel();
      return new Response(null, { status: 413, headers });
    }

    return new Response(statements.body, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  },
};
