// spec/app/admin/operators.md, "Story: Grant and revoke access"; spec/app/billing/deposits.md, "Story: Open a payment intent"
import { ConfigProvider, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { validateStartup } from "../src/serve.vibe";

const operator = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const support = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const validProduction: Record<string, string> = {
  NODE_ENV: "production",
  SONNELY_ADMIN_WALLETS: operator,
  SONNELY_SUPPORT_WALLETS: support,
  SONNELY_PUBLIC_INFERENCE: "true",
  NEAR_AI_API_KEY: "near-key",
  SOLANA_BILLING_CLUSTER: "mainnet",
  SOLANA_TREASURY: operator,
  SOLANA_RPC_URL: "https://rpc.example.test",
};

function runWith(env: Record<string, string>) {
  return Effect.runPromise(
    Effect.exit(
      validateStartup().pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env)),
      ),
    ),
  );
}

describe("production startup validation", () => {
  it("does nothing outside production", async () => {
    expect(Exit.isSuccess(await runWith({ NODE_ENV: "development" }))).toBe(true);
  });

  it("fails fast when production has no operator seed and no billing config", async () => {
    const exit = await runWith({ NODE_ENV: "production" });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("treats a Vercel production deployment as production", async () => {
    const exit = await runWith({ ...validProduction, NODE_ENV: "", VERCEL_ENV: "production" });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("fails fast when an operator seed is not a Solana wallet", async () => {
    const exit = await runWith({ ...validProduction, SONNELY_SUPPORT_WALLETS: "not-a-wallet" });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("accepts the legacy SONNELY_OPERATORS seed as an admin wallet", async () => {
    const rest = { ...validProduction } as Record<string, string>;
    delete rest.SONNELY_ADMIN_WALLETS;
    const exit = await runWith({ ...rest, SONNELY_OPERATORS: operator });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("fails fast when support and finance seeds exist without any admin", async () => {
    const rest = { ...validProduction } as Record<string, string>;
    delete rest.SONNELY_ADMIN_WALLETS;
    const exit = await runWith({ ...rest, SONNELY_FINANCE_WALLETS: support });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("fails fast when the cluster is not mainnet", async () => {
    const exit = await runWith({ ...validProduction, SOLANA_BILLING_CLUSTER: "devnet" });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("fails fast without a treasury or rpc endpoint", async () => {
    const rest = { ...validProduction } as Record<string, string>;
    delete rest.SOLANA_TREASURY;
    delete rest.SOLANA_RPC_URL;
    const exit = await runWith(rest);
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("fails fast when no inference provider key is set", async () => {
    const rest = { ...validProduction } as Record<string, string>;
    delete rest.NEAR_AI_API_KEY;
    const exit = await runWith(rest);
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("fails fast when every keyed provider is paused", async () => {
    const exit = await runWith({ ...validProduction, SONNELY_PAUSED_PROVIDERS: "near-ai" });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("passes with one unpaused provider key among several", async () => {
    const exit = await runWith({ ...validProduction, SONNELY_PAUSED_PROVIDERS: "near-ai", TINFOIL_API_KEY: "tinfoil-key" });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("fails fast when the public inference kill switch leaves no provider usable", async () => {
    const rest = { ...validProduction } as Record<string, string>;
    delete rest.SONNELY_PUBLIC_INFERENCE;
    const exit = await runWith(rest);
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("passes with operators, mainnet, treasury, rpc and a usable provider", async () => {
    expect(Exit.isSuccess(await runWith(validProduction))).toBe(true);
  });
});
