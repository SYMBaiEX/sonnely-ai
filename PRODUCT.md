# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and teams who need private LLM inference and want to pay for it on Solana. They sign in with a Solana wallet, fund credits, create API keys with spending limits, and call an OpenAI-compatible API from their own code. Inferred from the repository; not yet confirmed by the owner.

Operators (admin, support and finance wallets) run the platform from the admin console: customers, support tickets, traces, payouts and analytics.

## Product Purpose

Sonnely is an open-source gateway for confidential model inference. It streams completions through an OpenAI-compatible API, enforces per-key spending limits, and shows token usage and the exact charge for every request in a workspace. Success is a developer who can switch an existing OpenAI client to Sonnely, verify that their prompts ran in a confidential environment, and see precisely what each call cost.

## Positioning

Confidential inference with evidence: models run in hardware-isolated environments that publish attestation evidence the visitor can check (`/verify`, `/docs/attestation`), and payment is wallet-native on Solana with no project token. Inferred from the repository; not yet confirmed by the owner.

## Operating Context

- Public site: home, inference, models catalog and model detail, pricing, status, verify, journal (`/blog`), docs, contact, privacy, terms.
- Console (`/console/*`): chat playground, model catalog, keys, usage, logs, batch, billing, teams, referrals, support, settings, and admin areas for operators.
- Visitors evaluate the product on desktop while reading docs and pricing; the console is used alongside a code editor and terminal. Mobile web must work for every page.

## Capabilities and Constraints

- Sign-in is a Solana wallet signature (Wallet Standard, Mobile Wallet Adapter on supported Android browsers). Signing in never sends a transaction or moves funds, and the UI must say so where it asks for a signature.
- Credits are funded by finalized USDC and native SOL transfers through Solana Pay; inference is paid from the credit balance. Checkout is disabled when the billing cluster, RPC or treasury is not configured, and the UI must handle that state.
- Light and dark themes are both first-class; dark follows the system unless the visitor overrides it.
- Every interface is React with Tailwind CSS v4 on the tokens in `packages/design-system` (`tokens.json` is the source; `design.md` explains it). No hard-coded colors and no second token set.
- Application state lives in spec-backed machines (`spec/`); UI work must not keep spec-owned state in components.

## Brand Commitments

- Name: Sonnely. Tagline in use: "Confidential AI inference on Solana."
- Existing brand assets live in `apps/app/src/web/public/` (`brand/`, `homepage/`, and the day/night scene artwork).
- The design system's stated rule: one accent on quiet neutrals; color carries meaning, position and weight carry hierarchy.

## Evidence on Hand

- Real product surfaces and docs in `apps/app/src/web/areas/` and the docs content they render.
- Model catalog and pricing data served by the app.
- No customer testimonials, case studies, usage numbers or benchmarks exist. Future work must not fabricate them.

## Product Principles

1. Prove, don't claim: confidentiality and charges are shown with verifiable evidence, not adjectives.
2. Exact money: every amount is the precise charge or balance, bound to the selected wallet and network.
3. Drop-in for developers: anything that looks like an API matches the OpenAI-compatible shape people already use.
4. Calm workspace: the console favors scannable, dense, consistent screens over decoration.

## Accessibility & Inclusion

Text and control colors meet WCAG AA in both themes, and control edges and the focus ring meet 3:1 (WCAG 1.4.11), as the design system already enforces.
