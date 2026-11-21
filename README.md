# Fathom Relay

Solana-native private inference workspace with a public model catalog, docs, journal, and support. The console provides wallet sessions, browser-local optional chat history, scoped API keys, usage, Solana Pay, and NEAR Intents quote previews.

## Run locally

Use Node 22 and pnpm. Install dependencies with `pnpm install`.

1. Start Convex in a separate terminal with `CONVEX_AGENT_MODE=anonymous pnpm exec convex dev`.
2. Generate a random service secret and set `RELAY_SERVICE_SECRET` in Convex. Put the same secret and the local `CONVEX_URL` in `.env.local`. See `.env.example`.
3. Run `pnpm dev`. Use the playground samples before configuring a live model provider.

Run `pnpm check` and `pnpm build` to verify the app. With a local Convex deployment and Next server configured, run `RELAY_TEST_URL=http://localhost:3000 pnpm exec playwright test` for browser checks.

## Deployment configuration

Set `CONVEX_URL` and `RELAY_SERVICE_SECRET` in the deployment environment. Set the matching secret in Convex. Deploy Convex functions before deploying the frontend.

| Variable | Purpose |
| --- | --- |
| `NEAR_AI_API_KEY` | Managed text completions through NEAR AI. Install a dedicated, funded project key with a restricted upstream spending limit. |
| `SOLANA_TREASURY` | Public wallet address for USDC transfers. |
| `SOLANA_RPC_URL` | Solana RPC matching the billing cluster. |
| `SOLANA_BILLING_CLUSTER` | Defaults to `devnet`. Mainnet checkout also requires an inference key. Devnet receipts never create spendable credits. |
| `NEAR_INTENTS_API_KEY` | Optional 1Click credential. The integration requests dry quotes only. |

The API supports `GET /v1/models` and non-streaming text `POST /v1/chat/completions`. The gateway terminates HTTPS and forwards the prompt to NEAR AI. Verify provider evidence with the NEAR AI Verification Center. End-to-end encryption and per-response attestation verification are outside the gateway implementation.

Support requests land in the Convex `tickets` table. Set up an operator inbox before advertising response times. Provider timeouts or incomplete usage may leave reservations held. Review the usage ledger and provider-side usage before making balance adjustments.
