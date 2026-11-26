# Factory Round 1 — compiled audit (3 lanes + session knowledge)

## P0 money/safety
1. Upstream inference calls have NO timeouts — hung provider holds user reserve (providers.ts callChat signal:null)
2. Production serves fake "staging" inference but charges real money if providers unconfigured — must fail closed
3. Confidential USDC checkout is client-localStorage-only — money in, never credited. REMOVE (product decision made: removal over building verification service)
4. Open bootstrap: empty roster + missing SONNELY_OPERATORS = first signer is operator. Fail startup in production without valid roster seed
5. Devnet credits spendable same ledger as mainnet (pricing FAQ contradicts) — enforce mainnet in production startup
6. Ephemeral-state risk: verify Railway volume at /app/dist/data explicitly; sessions have survived deploys (evidence exists) but unconfirmed in config
7. Payouts pay theoretical markup without provider cost reconciliation — gate payouts behind reconciliation state (already partly there; harden)
8. Ambiguous mid-stream failure still charges full reserve — prorate using servedOutputChars

## Lane A — gateway.vibe + providers.ts (API conformance)
- A1 upstream timeouts: connect/headers/stream-idle deadlines
- A2 fail-closed production inference when no live providers
- A3 suspension enforcement: bearerKey/openMeter check admin registry (spec/app/admin/index.md:141,165)
- A4 GET /key full documented shape (label, expiry, daily+lifetime budgets, resets_at) — spec/app/docs/index.md:776-783
- A5 Idempotency-Key honored on specialized endpoints (docs:877)
- A6 max_cost_microusd on multipart endpoints (formModel drops it)
- A7 responses strictObject rejects documented store/instructions; rerank rejects documented top_n
- A8 staging wire shapes align to docs (redacted_text, document.md_content) + input validation in staging
- A9 X-Sonnely-Request-Id on every error response; error bodies gain param/code fields
- A10 tool-use capability rollout per docs or correct docs

## Lane B — billing.vibe + solana.ts + billing client
- B1 remove confidential checkout client + dead admin stubs
- B2 late-paid deposit recovery: sweep scans expired intents for late finalized payments (Wave B4)
- B3 deposit draft cleanup on finalize/expire
- B4 startup validation: mainnet required in production (billing.vibe config)

## Lane C — support/admin machines (support.vibe, admin.vibe, machines.vibe, admin client)
- C1 operator-scoped support read projection (staff sees all, users own)
- C2 staff write paths: staffReply/setState/assignOwner operator-gated
- C3 remove dead /api/console/batch/run endpoint (fake settlement trap)
- C4 UsageMax: implement /api/sonnely/usage-max POST+GET download OR remove UI (decision: implement minimal export)
- C5 gateway keyring orphan machine: retire (WorkspaceKeys does the work) — remove machine + spec or wire (decision: retire registration/endpoints, keep driver tests)

## Lane D — docs/site (docs.vibe, site/*.tsx content, legal)
- D1 GET /api/openapi endpoint (docs promise it in 3 places)
- D2 /v1/* alias or fix docs migration guide (decision: implement alias forwarding to /api/sonnely/v1)
- D3 copy consistency: pricing vs terms vs billing reality (SOL+USDC), privacy notice Convex removal
- D4 TypeScript SDK artifact: build sonnely-typescript-0.1.6.tgz or correct docs to Python-only
- D5 /models /pricing reflect live provider availability

## Lane E — platform infra (serve.vibe, health.vibe, site.vibe, main.vibe, session.vibe)
- E1 deep readiness: /api/health checks store writability + machine decode + config
- E2 status probe loop server-side + restrict POST /api/site/status (operator-only)
- E3 graceful shutdown drain window (gracefulShutdownTimeout: 0 today)
- E4 startup validation: SONNELY_OPERATORS present+valid in production, fail fast otherwise
- E5 rate limiting: per-IP on session challenge + deposit creation + status probes; per-key concurrency cap on inference
- E6 usage/ledger growth: document + implement compaction or retention (large — may defer)

## Lane F — feature wiring (chat.vibe, console client, keys.vibe, usage client)
- F1 logs pipeline: record every served inference into console__logs per-wallet (spec/console/logs.md:96) — gateway/chat paths call record; deep links then work
- F2 referrals end-to-end: issueCode client UI, ?ref= capture at signup, signup/markFunded/markActive hooks
- F3 batch machine per-wallet redesign (spec change — spec/app/gateway/batch.md "one job per wallet"): implement per-key batch state
- F4 logs ageDays advance or window-filter correction

## Deferred strategic (needs product/infra decision, NOT this round)
- Realtime WebSocket transcription endpoint (needs spec + provider realtime support)
- Compute rental real provider integration (Phala TDX) — currently simulation behind feature gate; keep gate
- Compute market machine integration
- DB migration for machine store (vibestack architectural conversation)
- Schema versioning/migrations for stored state

## Verified non-issues
- "Robinhood/USDG mixed deployment" = stale search indexing of old product; production verified Solana
