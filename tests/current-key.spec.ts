import { createHash, randomBytes } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { apiBasePath } from "../lib/api-contract";
import { mainnetMint } from "../lib/payments";

const canonical = apiBasePath + "/key";
const alias = "/v1/key";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const url = process.env.SONNELY_TEST_LOCAL_CONVEX;
const secret = process.env.SONNELY_TEST_CONVEX_SECRET;

test("the current API key endpoint requires a bearer and preserves API routing", async ({ request }) => {
  for (const path of [canonical, alias]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: 401, type: "sonnely_error", message: "Provide a Sonnely API key." },
    });
  }
  expect((await request.get("/api/v1/key")).status()).toBe(410);
  const spec = await (await request.get("/api/openapi")).json();
  expect(spec.paths["/key"].get.security).toEqual([{ SonnelyKey: [] }]);
  expect(spec.paths["/key"].get.responses["200"].content["application/json"].schema.$ref).toBe(
    "#/components/schemas/CurrentApiKey",
  );
});

test("current key status follows reservations, refunds, expiry, and revocation", async ({
  request,
  baseURL,
}) => {
  test.skip(!url || !secret, "Requires the isolated local Convex deployment.");
  if (!url || !secret || !baseURL || [url, baseURL].some((value) => new URL(value).hostname !== "127.0.0.1"))
    throw new Error("The key status integration test must use loopback services.");
  const client = new ConvexHttpClient(url);
  const base58 = getBase58Decoder();
  const address = () => base58.decode(randomBytes(32));
  const auth = { secret, session: randomBytes(32).toString("hex") };
  await client.mutation(api.sonnely.signIn, {
    ...auth,
    wallet: address(),
    nonce: randomBytes(20).toString("hex"),
    referral: randomBytes(8).toString("hex"),
    expires: Date.now() + 60_000,
  });
  const reference = address();
  await client.mutation(api.sonnely.createDeposit, {
    ...auth,
    reference,
    recipient: address(),
    mint: mainnetMint,
    cluster: "mainnet",
    amount: 1_000_000,
  });
  await client.mutation(api.sonnely.confirmDeposit, {
    ...auth,
    reference,
    signature: base58.decode(randomBytes(64)),
  });

  const token = "sonnely_live_" + randomBytes(32).toString("base64url");
  const legacy = "fr_live_" + randomBytes(32).toString("base64url");
  const expired = "sonnely_live_" + randomBytes(32).toString("base64url");
  const expires = Date.now() + 60_000;
  const create = (
    credential: string,
    name: string,
    cap: number | null,
    dailyCap: number | null,
    expiry: number | null,
  ) =>
    client.mutation(api.sonnely.createKey, {
      ...auth,
      name,
      prefix: credential.slice(0, 16),
      hash: hash(credential),
      cap,
      dailyCap,
      expires: expiry,
    });
  await create(token, "Production fixture", 250_000, 100_000, expires);
  await create(legacy, "Unlimited fixture", null, null, null);
  await create(expired, "Expired fixture", null, null, Date.now() - 1);
  const authorize = (credential: string) => ({ authorization: "Bearer " + credential });
  const check = (credential: string, path = canonical) =>
    request.get(path, { headers: authorize(credential) });
  const id = await client.mutation(api.sonnely.reserve, {
    secret,
    hash: hash(token),
    model: "fixture-model",
    cost: 40_000,
  });
  let response = await check(token);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const now = new Date();
  const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  expect(await response.json()).toEqual({
    data: {
      name: "Production fixture",
      expires_at_ms: expires,
      daily: {
        cap_microusd: 100_000,
        used_microusd: 40_000,
        remaining_microusd: 60_000,
        resets_at: nextDay.toISOString(),
      },
      lifetime: { cap_microusd: 250_000, used_microusd: 40_000, remaining_microusd: 210_000 },
    },
  });

  await client.mutation(api.sonnely.settle, {
    secret,
    id,
    status: "complete",
    cost: 30_000,
    input: 20,
    output: 10,
  });
  response = await check(token, alias + "?hash=" + hash(legacy));
  expect(response.status()).toBe(200);
  expect((await response.json()).data).toMatchObject({
    name: "Production fixture",
    daily: { used_microusd: 30_000, remaining_microusd: 70_000 },
    lifetime: { used_microusd: 30_000, remaining_microusd: 220_000 },
  });
  response = await check(legacy);
  expect(response.status()).toBe(200);
  expect((await response.json()).data).toMatchObject({
    name: "Unlimited fixture",
    expires_at_ms: null,
    daily: { cap_microusd: null, used_microusd: 0, remaining_microusd: null },
    lifetime: { cap_microusd: null, used_microusd: 0, remaining_microusd: null },
  });

  const key = (await client.query(api.sonnely.listKeys, auth)).find(
    (entry) => entry.name === "Production fixture",
  );
  expect(key).toBeDefined();
  await client.mutation(api.sonnely.revokeKey, { ...auth, id: key!.id });
  const unknown = "sonnely_live_" + randomBytes(32).toString("base64url");
  for (const credential of [token, expired, unknown]) {
    response = await check(credential);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: 401, type: "sonnely_error", message: "Invalid or expired API key." },
    });
  }
});
