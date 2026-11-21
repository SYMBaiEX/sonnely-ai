# Sonnely

Solana-native private inference workspace with a public model catalog, docs, journal, and support. The console provides wallet sessions, browser-local optional chat history, scoped API keys, usage, Solana Pay, and NEAR Intents quote previews.

## Run locally

Use Node 22 and pnpm. Install dependencies with `pnpm install`.

1. Start Convex in a separate terminal with `CONVEX_AGENT_MODE=anonymous pnpm exec convex dev`.
2. Generate a random service secret and set `SONNELY_SERVICE_SECRET` in Convex. Put the same secret and the local `CONVEX_URL` in `.env.local`. See `.env.example`.
3. Run `pnpm dev`. Use the playground samples before configuring a live model provider.

Run `pnpm check` and `pnpm build` to verify the app. With a local Convex deployment and Next server configured, run `SONNELY_TEST_URL=http://localhost:3000 pnpm exec playwright test` for browser checks.

## Deployment configuration

Set `CONVEX_URL` and `SONNELY_SERVICE_SECRET` in the deployment environment. Set the matching secret in Convex. Deploy Convex functions before deploying the frontend.

| Variable                 | Purpose                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEAR_AI_API_KEY`        | Managed text completions through NEAR AI. Install a dedicated, funded project key with a restricted upstream spending limit. |
| `PHALA_AI_API_KEY`       | Optional Phala Private AI inference key. Enables the explicit Phala route for DeepSeek V4.1 Flash 1017.                      |
| `SOLANA_TREASURY`        | Public wallet address for USDC transfers.                                                                                    |
| `SOLANA_RPC_URL`         | Solana RPC matching the billing cluster.                                                                                     |
| `SOLANA_BILLING_CLUSTER` | Defaults to `devnet`. Mainnet checkout also requires an inference key. Devnet receipts never create spendable credits.       |
| `NEAR_INTENTS_API_KEY`   | Optional 1Click credential. The integration requests dry quotes only.                                                        |

The API supports `GET /api/sonnely/v1/models` and non-streaming text `POST /api/sonnely/v1/chat/completions`. The gateway terminates HTTPS and forwards the prompt to the selected provider. Choose Phala with `provider: { only: ["phala"] }` where the catalog lists it. Set `max_cost_microusd` to refuse a request whose credit reservation would exceed the limit. See the [provider rollout and comparison](docs/inference-providers.md) for verification and accounting details.

Set `X-Sonnely-Receipt: v1` on a completion request for upstream byte hashes, billing metadata and NEAR signature checks. See the [receipt and marketplace notes](docs/solana-inference-marketplace.md) for the evidence boundary and grant milestones.

Set `SONNELY_ORIGIN` to the deployed site and `SONNELY_API_KEY` to your scoped console key when using the cURL, JavaScript, or Python examples. Current integrations use the OpenAI SDKs with the Sonnely base URL. Existing `/v1` clients and previously issued keys continue to work during the rename.

The Japanese forest artwork switches from winter to the evergreen collection at midnight on January 1, 2027 in America/Chicago. Both collections include dark and light versions for the site and workspace.

Support requests land in the Convex `tickets` table. Set up an operator inbox before advertising response times. Provider timeouts or incomplete usage may leave reservations held. Review the usage ledger and provider-side usage before making balance adjustments.

## Recovery and launch

Set the mainnet Helius `SOLANA_RPC_URL` on Convex alongside `SONNELY_TREASURY_WALLET`. The Convex cron checks open USDC drafts every two minutes, backs off older drafts, and applies the same finalized transfer and signature checks as browser checkout. Check `/api/health` or `/status` for the recovery heartbeat. The inference-provider check in health verifies configuration without incurring inference costs.

In Admin, open Held credits to investigate an unreported request or a pending reservation older than five minutes. Record the provider receipt or investigation note before releasing the hold or entering a verified final charge. The resolution updates the customer balance and API key budgets together and saves an admin audit entry. Actual provider cost still needs a matching upstream billing record to affect payable margin.

Public mode is controlled by `SONNELY_PUBLIC_INFERENCE=true`. It removes wallet allowlisting and requires the current terms version before funding or inference, including requests made with existing keys. Obtain provider approval and review the customer terms before enabling public mode. Accepted versions and timestamps are persisted in Convex. The public API schema is at `/api/openapi`.
