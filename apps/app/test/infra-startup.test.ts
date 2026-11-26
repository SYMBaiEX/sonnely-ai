import { ConfigProvider, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { validateStartup } from "../src/serve.vibe";

const operator = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

const validProduction: Record<string, string> = {
  NODE_ENV: "production",
  SONNELY_OPERATORS: operator,
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

  it("fails fast when the operator seed is not a Solana wallet", async () => {
    const exit = await runWith({ ...validProduction, SONNELY_OPERATORS: "not-a-wallet" });
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

  it("passes with operators, mainnet, treasury and rpc", async () => {
    expect(Exit.isSuccess(await runWith(validProduction))).toBe(true);
  });
});
