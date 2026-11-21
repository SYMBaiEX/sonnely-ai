# Inference providers

Sonnely uses NEAR AI by default. An explicitly selected Phala route for DeepSeek V4.1 Flash 1017 uses Phala's own GPU TEE route. The API catalog advertises Phala when an inference key is configured.

## Try Phala from Sonnely

Use an existing funded Sonnely API key and the same public model ID as on NEAR. This request caps the credit reservation at 1,000 micro-USD ($0.001).

```sh
curl https://sonnely.com/v1/chat/completions \
  -H "Authorization: Bearer $SONNELY_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'X-Sonnely-Receipt: v1' \
  --data '{
    "model": "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    "messages": [{"role": "user", "content": "Reply with exactly READY."}],
    "max_tokens": 32,
    "provider": { "only": ["phala"] },
    "max_cost_microusd": 1000
  }'
```

Phala's published DeepSeek route prices are $0.30 input, $0.006 cached input, and $1.20 output per million tokens. Sonnely's routes endpoint publishes the marked-up rates of $0.33, $0.0066, and $1.32. Phala can list multiple upstream operators under one model ID. Sonnely restricts the upstream request to Phala and checks that the ACI receipt names a Phala route, reports a verified upstream session and matches the exact request and response hashes. Missing or mismatched evidence fails the request and releases the customer reservation. Keep the receipt private. [Phala DeepSeek model and rates](https://phala.com/models/deepseek/deepseek-v4.1-flash-1017) · [Phala verification guide](https://phala.com/confidential-ai-models/verification)

The receipt check trusts the authenticated HTTPS response from Phala. It does not independently verify the ACI signature or bind NEAR and Phala to the same weights. Phala's Private AI Proxy is the vendor's reference path for a hardware-rooted verification test. Upstream Phala-reported costs appear in admin traces. They are kept outside NEAR reconciliation and profit payouts until a separate Phala invoice reconciliation exists.

## Explore Tinfoil as a third provider

Start with the [Tinfoil quickstart](https://docs.tinfoil.sh/quickstart), [JavaScript SDK](https://docs.tinfoil.sh/sdk/javascript-sdk) and [verification guide](https://docs.tinfoil.sh/verification/verification-in-tinfoil). The Node SDK supports Node 20+ and verifies the enclave at connection time, pins TLS and encrypts the HTTP body to the attested enclave. Direct OpenAI-compatible HTTPS at `https://inference.tinfoil.sh/v1` gives audit-time verification by the provider's documentation. A direct Sonnely server integration would encrypt from Sonnely to Tinfoil. A client-side encrypted pass-through is a separate design with a different prompt-visibility boundary. [Tinfoil encrypted proxy design](https://docs.tinfoil.sh/guides/proxy-server)

Use `deepseek-v4-1-flash` for a first comparison. Tinfoil's public deployment pins `deepseek-ai/DeepSeek-V4.1-Flash-1017` at `1bae0e10`. Its published token rates for that model are $0.60 input, $0.01 cached input, and $1.45 output per million tokens. Compare the signed weight commitments from all operators before claiming artifact equivalence. [Pinned deployment](https://github.com/tinfoilsh/confidential-deepseek-v4-1-flash) · [Tinfoil model catalog](https://tinfoil.sh/models)

Obtain an inference key scoped to a project, confirm pricing and production routing terms, and run a synthetic completion with the official SDK and a reproducible verification record. The Tinfoil dashboard has tier and spend information. Tinfoil documents that in-flight requests can exceed an upstream spend limit, so preserve Sonnely's admission-time cap and bound provider concurrency. [Tinfoil API key guide](https://docs.tinfoil.sh/get-api-key) · [Pricing, quotas and spend limits](https://tinfoil.sh/pricing)

## Competitive and builder priorities

| Capability                        | This pass                                                                                                                                  | Remaining work                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider choice and cost controls | Explicit route pin, per-provider prices in the model catalog, admission-time request cap, and provider grouping in Usage and admin traces. | Publish per-route availability and latency. Add opt-in fallback only after buyers can constrain the route to the same artifact and privacy policy and after duplicate provider charges can be reconciled. [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)                                                                                                                      |
| Auditable confidential inference  | Provider-aware receipts and Phala route and byte checks.                                                                                   | Independently verify hardware, signature and weight commitments. Publish reference policies and fixtures so developers can reproduce the result. [Tinfoil verification](https://docs.tinfoil.sh/verification/verification-in-tinfoil) · [Phala verification](https://phala.com/confidential-ai-models/verification)                                                                                                        |
| Developer API coverage            | OpenAI-compatible text, stable model IDs, route discovery and OpenAPI.                                                                     | Prioritize streaming with final usage accounting, followed by tool calls and structured outputs on supported routes. [OpenRouter API compatibility](https://openrouter.ai/docs/api/reference/overview)                                                                                                                                                                                                                     |
| Open provider participation       | Two provider adapters and a signed listing prototype.                                                                                      | Add indexed discovery with monotonic revisions, publish safe performance aggregates, and demonstrate a Solana devnet settlement batch. A new listing remains a claim until the endpoint and evidence are verified. [Solana marketplace brief](https://solana.com/request-for-startups.md#ai-inference-marketplace) · [Solana MPP metered sessions](https://solana.com/docs/payments/agentic-payments/mpp#metered-sessions) |
