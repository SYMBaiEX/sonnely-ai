import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mock } from "node:test";
import { expect, test } from "@playwright/test";
import { Wallet } from "ethers";
import { NextRequest } from "next/server";
import { POST } from "../app/api/sonnely/v1/chat/completions/route";
import { api } from "../convex/_generated/api";
import { models } from "../lib/models";
import { requestCharge } from "../lib/pricing";
import { backend, hash } from "../lib/server";

const model = models[0];
const messages = [{ role: "user", content: "Say hello in Japanese." }];
const completionId = "chatcmpl-receipt-test";
const body =
  JSON.stringify(
    {
      id: completionId,
      object: "chat.completion",
      created: 1,
      model: model.id,
      choices: [{ index: 0, message: { role: "assistant", content: "こんにちは" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 25 } },
    },
    null,
    2,
  ) + "\n";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

test("opt-in receipts match wire bytes and the settled Convex charge", async ({ baseURL }) => {
  test.skip(!baseURL || new URL(baseURL).hostname !== "127.0.0.1", "Local Convex fixture");
  process.loadEnvFile(".env.local");
  if (!process.env.CONVEX_URL?.startsWith("http://127.0.0.1:")) throw new Error("Local Convex required");

  const { db, secret } = backend();
  const apiKey = "sonnely_live_" + randomBytes(32).toString("base64url");
  const auth = { secret, session: hash(randomUUID()) };
  await db.mutation(api.sonnely.signIn, {
    ...auth,
    wallet: randomUUID(),
    nonce: randomUUID(),
    referral: randomUUID(),
    expires: Date.now() + 60_000,
  });
  const reference = randomUUID();
  const balance = 10_000;
  await db.mutation(api.sonnely.createDeposit, {
    ...auth,
    reference,
    amount: balance,
    recipient: "fixture",
    mint: "fixture",
    cluster: "mainnet",
  });
  await db.mutation(api.sonnely.confirmDeposit, { ...auth, reference, signature: randomUUID() });
  await db.mutation(api.sonnely.createKey, {
    ...auth,
    hash: hash(apiKey),
    name: "Receipt test",
    prefix: apiKey.slice(0, 19),
    cap: null,
    dailyCap: null,
    expires: null,
  });

  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NEAR_AI_API_KEY: "mock-provider-key",
    VERCEL_ENV: "",
    SONNELY_PUBLIC_INFERENCE: "false",
    SONNELY_PILOT_WALLET: "",
  };
  const originalFetch = globalThis.fetch;
  const inferenceId = randomUUID();
  const signer = Wallet.createRandom();
  let scenario: "provider_tee" | "gateway" | "tampered" | "forged" | "unavailable" = "provider_tee";
  let sentBody = "";
  let noAliasing: string | null = null;
  let evidenceFetches = 0;
  const providerFetch = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin !== "https://cloud-api.near.ai") return originalFetch(input, init);
      if (url.pathname === "/v1/chat/completions") {
        noAliasing = new Headers(init?.headers).get("x-no-aliasing");
        sentBody = String(init?.body);
        return new Response(body, { headers: { "inference-id": inferenceId } });
      }
      if (
        url.pathname !== "/v1/signature/" + completionId ||
        url.searchParams.get("signing_algo") !== "ecdsa"
      ) {
        throw new Error("Unexpected provider URL");
      }
      evidenceFetches++;
      if (scenario === "unavailable") return Response.json({ error_code: "missing" }, { status: 404 });
      const signatureKind = scenario === "gateway" || scenario === "tampered" ? "gateway" : "provider_tee";
      const requestHash = sha(sentBody);
      const responseHash = scenario === "tampered" ? sha(body.trim()) : sha(body);
      const text =
        (signatureKind === "provider_tee" ? model.id + ":" : "") + requestHash + ":" + responseHash;
      const signature = await signer.signMessage(text);
      return Response.json({
        signature_kind: signatureKind,
        signing_algo: "ecdsa",
        signing_address: scenario === "forged" ? "a".repeat(40) : signer.address.slice(2),
        signature: signature.slice(2),
        text,
      });
    },
  );

  function submit(receipt?: string, key = apiKey) {
    return POST(
      new NextRequest("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
          ...(receipt ? { "X-Sonnely-Receipt": receipt } : {}),
        },
        body: JSON.stringify({ messages, model: model.id, max_tokens: 1 }),
      }),
    );
  }

  try {
    expect((await submit("v2")).status).toBe(400);
    expect((await submit("v1", "")).status).toBe(401);
    const ordinary = await submit();
    expect(ordinary.status).toBe(200);
    expect(noAliasing).toBeNull();
    expect(await ordinary.json()).not.toHaveProperty("sonnely_receipt");
    expect(evidenceFetches).toBe(0);

    const response = await submit("v1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(noAliasing).toBe("true");
    const receipt = (await response.json()).sonnely_receipt;
    const cost = requestCharge(model, 50, 25, 10);
    expect(receipt).toMatchObject({
      version: "v1",
      provider: "near-ai",
      requested_model: model.id,
      reported_model: model.id,
      provider_completion_id: completionId,
      billing_reference: inferenceId,
      charged_microusd: cost,
      cached_input_tokens: 25,
      upstream_request_sha256: sha(sentBody),
      upstream_response_sha256: sha(body),
      evidence: { status: "signature_matched", signature_kind: "provider_tee" },
    });
    expect(JSON.stringify(receipt)).not.toContain(messages[0].content);
    expect(JSON.stringify(receipt)).not.toContain("こんにちは");
    expect(JSON.stringify(receipt)).not.toContain(apiKey);

    for (const [nextScenario, expected] of [
      ["gateway", { status: "signature_matched", signature_kind: "gateway" }],
      ["tampered", { status: "payload_mismatch" }],
      ["forged", { status: "invalid_signature" }],
      ["unavailable", { status: "unavailable" }],
    ] as const) {
      scenario = nextScenario;
      const next = await submit("v1");
      expect(next.status).toBe(200);
      expect((await next.json()).sonnely_receipt.evidence).toMatchObject(expected);
    }
    expect(evidenceFetches).toBe(5);
    const account = await db.query(api.sonnely.consoleLive, { ...auth, since: 0 });
    expect(account?.balance).toBe(balance - cost * 6);
    expect(account?.rows.map(({ cost, status }) => ({ cost, status }))).toEqual(
      Array(6).fill({ cost, status: "complete" }),
    );
  } finally {
    providerFetch.mock.restore();
    process.env = originalEnv;
  }
});
