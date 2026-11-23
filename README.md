# Sonnely

Solana-native private inference workspace with a public model catalog, docs, journal, and support. The console provides wallet sessions, browser-local optional chat history, scoped API keys, usage, and Solana Pay.

[Website](https://sonnely.com) · [Console](https://sonnely.com/console) · [Documentation](https://docs.sonnely.com)

## Run locally

Use Node 22 and pnpm. Install dependencies with `pnpm install`.

1. Start Convex in a separate terminal with `CONVEX_AGENT_MODE=anonymous pnpm exec convex dev`.
2. Generate a random service secret and set `SONNELY_SERVICE_SECRET` in Convex. Put the same secret and the local `CONVEX_URL` in `.env.local`. See `.env.example`.
3. Run `pnpm dev`. Use the playground samples before configuring a live model provider.

Run `pnpm check` and `pnpm build` to verify the app. With a local Convex deployment and Next server configured, run `SONNELY_TEST_URL=http://localhost:3000 pnpm exec playwright test` for browser checks.

For tests that exercise admin roles or billing reconciliation, configure your local Convex deployment with the synthetic addresses in [tests/fixtures/wallets.ts](tests/fixtures/wallets.ts). Add both admin and treasury to `SONNELY_ADMIN_WALLETS`, then set `SONNELY_TREASURY_WALLET` and `SONNELY_PROFIT_WALLET`. To use different fixture addresses, set the corresponding `SONNELY_TEST_*_WALLET` overrides in your local `.env.local` and configure the same addresses in local Convex.

## Deployment configuration

Set `CONVEX_URL` and `SONNELY_SERVICE_SECRET` in the deployment environment. Set the matching secret in Convex. Deploy Convex functions before deploying the frontend.

| Variable                       | Purpose                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NEAR_AI_API_KEY`              | Managed text completions through NEAR AI. Install a dedicated, funded project key with a restricted upstream spending limit.        |
| `PHALA_AI_API_KEY`             | Optional Phala Private AI inference key. Enables the explicit Phala route for DeepSeek V4.1 Flash 1017.                             |
| `TINFOIL_API_KEY`              | Optional Tinfoil inference key. Enables the attested DeepSeek V4.1 Flash 1017 route.                                                |
| `SOLANA_TREASURY`              | Public wallet address for USDC transfers.                                                                                           |
| `SOLANA_RPC_URL`               | Solana RPC matching the billing cluster.                                                                                            |
| `SOLANA_BILLING_CLUSTER`       | Defaults to `devnet`. Mainnet checkout also requires an enabled inference provider. Devnet receipts never create spendable credits. |
| `SONNELY_NEAR_INTENTS_FUNDING` | Defaults to `false`. Set to `true` to enable the NEAR Intents funding UI and quote API.                                             |
| `NEAR_INTENTS_API_KEY`         | Optional 1Click credential for the server-backed quote API when NEAR Intents funding is enabled.                                    |

The API supports `GET /api/sonnely/v1/models` and `POST /api/sonnely/v1/chat/completions`. Choose an available provider with `provider.only`. Set `stream: true` for SSE and `stream_options.include_usage: true` to receive the final token totals. Sonnely settles reported usage before emitting `[DONE]`. The provider may finish and incur a charge after a client disconnects. `max_cost_microusd` caps the credit reservation before inference. Use Node 22.23.4 or newer in the Node 22 line to run the Tinfoil SDK. See the [provider comparison](docs/inference-providers.md) for evidence and accounting details.

Set `X-Sonnely-Receipt: v1` on a completion request for upstream byte hashes, billing metadata and NEAR signature checks. See the [receipt and marketplace notes](docs/solana-inference-marketplace.md) for the evidence boundary and grant milestones.

Set `SONNELY_ORIGIN` to the deployed site and `SONNELY_API_KEY` to your scoped console key when using the cURL, JavaScript, or Python examples. The hosted [SDK guide](https://sonnely.com/docs/sdks) covers the first-party clients and the OpenAI SDKs. Existing `/v1` clients and previously issued keys continue to work during the rename.

The Japanese forest artwork switches from winter to the evergreen collection at midnight on January 1, 2027 in America/Chicago. Both collections include dark and light versions for the site and workspace.

Support requests land in the Convex `tickets` table. Set up an operator inbox before advertising response times. Provider timeouts or incomplete usage may leave reservations held. Review the usage ledger and provider-side usage before making balance adjustments.

## Recovery and launch

See the [launch operations runbook](docs/launch-operations.md) for compute flags, independent alert delivery, provider statement automation, operator roles, and ledger restore.

Set the mainnet Helius `SOLANA_RPC_URL` on Convex alongside `SONNELY_TREASURY_WALLET`. The Convex cron checks open USDC drafts every two minutes, backs off older drafts, and applies the same finalized transfer and signature checks as browser checkout. Check `/api/health` or `/status` for the recovery heartbeat. The inference-provider check in health verifies configuration without incurring inference costs.

In Admin, open Held credits to investigate an unreported request or a pending reservation older than five minutes. Record the provider receipt or investigation note before releasing the hold or entering a verified final charge. The resolution updates the customer balance and API key budgets together and saves an admin audit entry. Actual provider cost still needs a matching upstream billing record to affect payable margin.

Public mode is controlled by `SONNELY_PUBLIC_INFERENCE=true`. It enables new production inference and mainnet checkout with current terms acceptance, including requests made with existing keys. Existing payments and provider costs can still reconcile while new inference is disabled. Obtain provider approval and review the customer terms before enabling public mode. Accepted versions and timestamps are persisted in Convex. The public API schema is at `/api/openapi`.

## Documentation and SDK releases

Fumadocs reads the versioned MDX in [content/docs](content/docs). Update the corresponding guides when an API, billing, privacy, or product behavior changes. The deployment serves the same docs at `/docs` and on the documentation domain. The public OpenAPI spec is generated by the gateway.

The first-party clients live in [sdk/typescript](sdk/typescript) and [sdk/python](sdk/python). To build a new version, update the package versions and download URLs in the SDK guide, then run from the repository root:

```sh
pnpm exec tsc -p sdk/typescript/tsconfig.json
npm pack ./sdk/typescript --ignore-scripts --pack-destination public/sdk
uv build --wheel --out-dir public/sdk sdk/python
```

Commit the versioned package files in `public/sdk`. Keeping immutable URLs lets existing installs remain reproducible. Use a new version when changing a client.

## License

[MIT](LICENSE)
