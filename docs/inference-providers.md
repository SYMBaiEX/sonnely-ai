# Inference providers

Sonnely uses NEAR AI by default. DeepSeek V4.1 Flash 1017 also has explicit Phala and Tinfoil routes. The API catalog advertises additional routes when their inference keys are configured. Each request stays on its selected route.

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

## Tinfoil

Set `provider.only` to `["tinfoil"]` for DeepSeek V4.1 Flash 1017. Sonnely uses Tinfoil’s SDK to verify the router and encrypt the request body to the attested enclave. Prompt-cache scope is isolated per Sonnely key or session. Sonnely still receives the original request over HTTPS. Tinfoil usage stays separate from NEAR reconciliation and profit payouts. [Tinfoil JavaScript SDK](https://docs.tinfoil.sh/sdk/javascript-sdk) · [Tinfoil proxy boundary](https://docs.tinfoil.sh/guides/proxy-server)

## Compare DeepSeek evidence

| Route   | Evidence available                                                                                                                                                             | Evidence needed for weight equivalence                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| NEAR AI | The gateway serves the canonical model ID. NEAR’s public endpoint returned two model-attestation candidates. A matching stream signature can bind bytes to the gateway signer. | Verify model reports and acquire a comparable signed weight manifest for the serving deployment.               |
| Phala   | A matching ACI receipt identifies the Phala-operated route, upstream verification session, and hashes of the exact request and response bytes.                                 | Independently verify the ACI signature and session evidence and obtain the serving weight-manifest commitment. |
| Tinfoil | The SDK verifies the confidential router. Tinfoil publicly pins checkpoint `1bae0e10` for its DeepSeek deployment.                                                             | Obtain a model-specific attestation linking the response to a weight manifest comparable with the others.      |

All three select the same named DeepSeek release. Responses alone cannot establish equivalence of weights, precision, adapters, or serving parameters. [NEAR model attestations](https://docs.near.ai/cloud/verification/cloud-api/model-attestations) · [Phala verification](https://phala.com/confidential-ai-models/verification) · [Tinfoil deployment](https://github.com/tinfoilsh/confidential-deepseek-v4-1-flash)

## Streaming and settlement

Set `"stream": true` and `"stream_options": {"include_usage": true}` to receive SSE deltas and final usage. Sonnely requests the final provider usage even when the client omits `include_usage`. It settles credits and key budgets before emitting the optional final usage or receipt and `[DONE]`. Phala deltas are provisional until its final receipt check succeeds.

If the client disconnects, the gateway drains the upstream stream within its deadline. If the provider completes and reports usage, the balance still settles. With incomplete upstream usage, the reservation stays open for reconciliation. A connected client receives an error event and no success marker. [Sonnely streaming API](https://sonnely.com/docs#streaming)

## Competitive and builder priorities

| Capability                        | This pass                                                                                                                                  | Remaining work                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider choice and cost controls | Explicit route pin, per-provider prices in the model catalog, admission-time request cap, and provider grouping in Usage and admin traces. | Publish per-route availability and latency. Add opt-in fallback only after buyers can constrain the route to the same artifact and privacy policy and after duplicate provider charges can be reconciled. [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)                                                                                                                      |
| Auditable confidential inference  | Provider-aware receipts and Phala route and byte checks.                                                                                   | Independently verify hardware, signature and weight commitments. Publish reference policies and fixtures so developers can reproduce the result. [Tinfoil verification](https://docs.tinfoil.sh/verification/verification-in-tinfoil) · [Phala verification](https://phala.com/confidential-ai-models/verification)                                                                                                        |
| Developer API coverage            | OpenAI-compatible text and streaming, final usage settlement, stable model IDs, route discovery and OpenAPI.                               | Add tool calls and structured outputs on supported routes. [OpenRouter API compatibility](https://openrouter.ai/docs/api/reference/overview)                                                                                                                                                                                                                                                                               |
| Open provider participation       | Two provider adapters and a signed listing prototype.                                                                                      | Add indexed discovery with monotonic revisions, publish safe performance aggregates, and demonstrate a Solana devnet settlement batch. A new listing remains a claim until the endpoint and evidence are verified. [Solana marketplace brief](https://solana.com/request-for-startups.md#ai-inference-marketplace) · [Solana MPP metered sessions](https://solana.com/docs/payments/agentic-payments/mpp#metered-sessions) |
