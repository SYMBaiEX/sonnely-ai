# Sonnely and Solana’s open inference marketplace

Sonnely runs an OpenAI-compatible inference gateway with Solana wallet identity, USDC funding, API-key budgets, and token-level billing. Its first target users for a marketplace pilot are Solana agent teams that need to choose a model, cap spend, and audit each completion. That user segment is a hypothesis to validate with design partners.

## What exists today

| Solana’s brief                                       | Sonnely’s current implementation                                                                                                                                                      | Marketplace work remaining                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared gateway across independent providers          | One API across configured NEAR AI, Phala, and Tinfoil routes. The provider catalog lists upstream models and indicates which workloads Sonnely can run.            | Verify equivalent, pinned artifacts independently before adding opt-in failover.                                                                                                             |
| Providers can join without a central listing process | The routable catalog is maintained in code. This branch prototypes portable manifests signed by each provider’s Solana wallet.                                                        | Add a discovery feed that tracks revisions and revocations. Gate live endpoint activation on endpoint ownership, routing safety, health, and proof policy.                                   |
| Identify which model served a request                | Sonnely records the selected catalog model. The live Chat Completions API supports private opt-in receipts with exact upstream byte hashes and checks NEAR signatures against the declared signing address. | Bind the signing address to fresh, independently verified preflight hardware evidence and a specific approved model artifact. Distinguish model-serving evidence from gateway-only evidence. |
| Reputation from performance and usage                | Convex records buyer usage and supports internal reconciliation.                                                                                                                      | Publish provider and model aggregates with a defined window, sample counts, success rate, p95 latency, and evidence coverage. Keep request contents and customer metadata private.           |
| Payments tied to usage and model development         | Buyers top up in USDC on Solana mainnet. Convex meters credits and records charges. Treasury and operator profit reconciliation are already implemented.                              | Settle verified usage to independent provider wallets. Add an auditable attribution rule for participating model authors, then test capped metered payments and recovery.                    |

[Solana’s request for an open inference marketplace](https://solana.com/request-for-startups.md#ai-inference-marketplace)

## First deliverable · Completion receipts

Add `X-Sonnely-Receipt: v1` to an authenticated request to `POST /v1/chat/completions`. The standard completion and usage fields remain available. The opt-in `sonnely_receipt` object includes the provider, model labels, completion and billing references, settled customer charge in integer micro-USD, cached input tokens, and SHA-256 digests of the exact request and response bodies at the NEAR Cloud boundary. Billing references may be derived from the provider completion ID for reconciliation.

The gateway asks NEAR to use the canonical model ID and requests the response signature by completion ID. It checks the exact signed text and recovers the signer with EIP-191. For `provider_tee`, the expected text includes the requested canonical model ID followed by the two hashes. For `gateway`, it includes only the two hashes, in request then response order. The signature check runs after credit settlement.

| Evidence state      | Meaning                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signature_matched` | The signed payload matches the upstream bytes and the recovered signer matches the address supplied with the signature. The receipt carries the signature and declared signer for independent inspection. |
| `payload_mismatch`  | The signed text differs from the expected model or byte digests.                                                                                                                                          |
| `invalid_signature` | The returned signature failed recovery or did not match the declared signing address.                                                                                                                     |
| `unavailable`       | The evidence lookup timed out, failed, or did not return a usable signature in the supported format.                                                                                                      |

Only an authenticated caller receives the receipt. Raw prompts and completions are excluded from the receipt, and the gateway attaches neither the receipt nor its digests to the usage ledger. Upstream hashes can still confirm guesses about content. Use synthetic prompts in public demonstrations.

The signature check covers upstream bytes and a declared signing key. It does not attest the gateway, the serving hardware, or the weights. The raw NEAR bytes differ from the JSON exposed by Sonnely, so a client needs those original bytes to recompute the digests independently. The NEAR guide also requires a uniquely matching verified preflight report for model-level response binding. [NEAR AI response signature verification](https://docs.near.ai/cloud/verification/cloud-api/response-signatures)

Review `/docs#receipts` and `/api/openapi` in the candidate build. Run `pnpm exec playwright test tests/inference-receipt.spec.ts` with a loopback Convex deployment. The test exercises signed evidence, a changed byte sequence, a mismatched signer, unavailable evidence, and the actual balance debit against a simulated provider. Live NEAR signature coverage and availability by model need their own validation.

## Provider listing prototype

A provider can describe a single model deployment in a portable, signed envelope. `providerListingMessage` in `lib/provider-listing.ts` produces the signable bytes. Sign those bytes with the operator’s Solana wallet and encode the detached 64-byte Ed25519 signature in base58. The envelope contains the original object under `listing` and the signature under `signature`.

The v1 signing format is the UTF-8 string `Sonnely Inference Provider Listing` followed by one LF and a compact JSON array with this exact order:

1. `version` (integer `1`)
2. `network` (`devnet` or `mainnet-beta`)
3. `operator_wallet` (base58 Solana address)
4. `model_id` (provider’s API model ID)
5. `artifact_sha256` (lowercase SHA-256 of the agreed artifact manifest)
6. `endpoint` (canonical HTTPS completion URL, without credentials, query or fragment)
7. `input_nanousd_per_token`
8. `cached_input_nanousd_per_token`
9. `output_nanousd_per_token`
10. `revision` (positive integer)
11. `expires_at` (Unix seconds)
12. `status` (`active` or `revoked`)

The three rates are nonnegative integers in billionths of a dollar per token. One nano-USD per token equals $0.001 per million tokens. The offline verifier checks the signature, schema, expected network and expiration. The identifier for future discovery is the tuple of network, operator wallet and artifact digest. An indexer must retain the highest accepted revision for that identifier, even after revocation expires, and reject rollbacks or conflicting same-revision bodies. Publishing a manifest makes a signed claim. It does not activate traffic, prove a provider controls the HTTPS endpoint, prove it serves the listed artifact, or authorize settlement.

Run `pnpm exec playwright test tests/provider-listing.spec.ts` to see two independent test keys sign prices and endpoints for the same digest. The test also signs a revocation and checks modified listings, incorrect networks and expired envelopes. It uses no Solana transactions.

## Milestones for a funding proposal

1. **Verify one model end to end.** Select one canonical, redistributable text model and pin the artifact revision and digest. Verify at least ten authorized test responses with matching preflight evidence and an approved artifact measurement per the deployment policy. Fail the verifier for altered bytes, model substitutions, stale evidence, and a gateway-only signer when the buyer requests model proof. Publish the receipt format, a reference verifier, and synthetic positive and negative fixtures as the public deliverables. Confirm the open-source license before publishing.
2. **Show independent supply.** Recruit a second operator permitted to serve the same model artifact. Add a discovery feed for the signed manifests and demonstrate wallet-signed publish, update, and revoke across restarts. Route the same OpenAI-compatible request to two independent operators without adding entries to the application source, and return evidence for the chosen operator. Keep endpoint acceptance and request routing independent from publishing a listing.
3. **Make reputation reproducible.** Publish scoped metrics per operator and model artifact with a time window, attempt count, completion rate, p95 latency, verified response rate, and billable tokens. Compare at least 100 controlled calls per operator and publish what counts as a failure or excluded sample. Output customer-safe aggregates and retain evidence of attribution even when a router retries.
4. **Settle usage on Solana.** Start with devnet USDC transfers for a small batch of verified receipts and permit a third party to reproduce the integer allocation and reconcile it to finalized transactions. Demonstrate payout idempotency, rejected replays, fee accounting and a synthetic author split backed by a signed attribution agreement. Then prototype a capped Solana MPP session with repeated cumulative usage vouchers, settlement, correct refund of the remainder and a documented recovery path if a counterparty disappears. Keep raw payloads and private usage offchain and show explicit opt-in before any production payment flow. [Solana MPP metered sessions](https://solana.com/docs/payments/agentic-payments/mpp#metered-sessions) · [Solana Attestations](https://solana.com/docs/tools/attestations)

The biggest dependency is independent supply that can produce auditable model-level evidence for the same pinned artifact, including the rights to serve it. Tinfoil is the first candidate to evaluate. Its public DeepSeek V4.1 Flash deployment pins checkpoint revision `1bae0e10`, and Sonnely already routes the same model ID through NEAR. Obtain NEAR’s corresponding weight or artifact commitment and compare it with Tinfoil’s. Independently verify each route and decide what evidence can be passed to a buyer before promising equivalent artifacts or proof. Confirm provider participation, model licensing, and integration terms before committing to dates or publishing operator claims. [Tinfoil deployment configuration](https://github.com/tinfoilsh/confidential-deepseek-v4-1-flash) · [Tinfoil attestation and weight commitments](https://tinfoil.sh/security-and-privacy-faq)

## Application draft

> Sonnely is a working Solana-funded inference gateway for developers and agents. Today a Solana wallet can fund compute with USDC and run metered inference across chat, image, audio, and document endpoints. The gateway forwards requests to providers and remains outside the model enclaves. We are building an open provider layer so developers can choose an independent inference operator for a specific model artifact, verify execution evidence, and settle usage on Solana.
>
> Our first users are Solana agent teams that need controls on both model provenance and spend. We propose an openly licensed receipt schema, reference verifier, and reproducible fixtures. The pilot will run the same pinned model through two independent operators and demonstrate reproducible reputation metrics and a devnet settlement batch. Solana provides wallet identities for providers and payouts, stablecoin settlement, and a path to capped metered payments. Signed model evidence is verified offchain.

Use the Builder Program application linked from the Request for Startups page for the commercial product and partner introductions. For Foundation funding, scope the public contribution to reusable artifacts or consider the convertible grant route for work that mixes public and commercial components. [Solana Builder Program](https://solana.com/request-for-startups) · [Solana Foundation funding and criteria](https://solana.org/grants-funding)

Complete the founder contact, location, public repository, project links, two partner commitments and the requested amount before filing. Build the budget from verified engineering time for each milestone, actual provider quotes, staging infrastructure and independent verification or settlement review. Attach a short demo with a normal completion, deliberately invalid evidence, independently routed completions and a finalized devnet settlement when those milestones are ready.
