# Sonnely

Confidential AI inference on Solana. Sonnely is an open-source gateway for
confidential model inference: stream completions through an OpenAI-compatible
API, set spending limits on API keys, and see token usage and exact charges in
a workspace. A visitor signs in with a Solana wallet; finalized USDC and SOL
payments fund credits through Solana Pay, and inference is paid from the
credit balance.

Built with [Vibestack](https://github.com/lalalune/vibestack) — thank you to
its authors. Every application rule lives as a story in `spec/` with a Quint
state machine beside it; the verified TypeScript core, Effect adapters and
React hooks are generated and proved from those models, and the shell around
them is VibeLang on Effect 4. `pnpm check` simulates every machine, replays
the generated code against the model, proves every obligation with Dafny,
drives the HTTP shell against the spec, and explores the page with Bombadil.

## Getting started

Requires Node 26+, pnpm 10+, and Dafny 4.11 (`pnpm doctor` checks the toolchain).

```sh
pnpm install
pnpm doctor
pnpm check
```

Run the app:

```sh
# Full stack, production-style: builds and serves the app with the API on one port.
pnpm -C apps/app start          # PORT=8080 pnpm -C apps/app start to choose a port

# Development: vite with hot reload on http://localhost:5173, /api proxied to the server.
pnpm -C apps/app start &        # the API server (any port; 3010 by convention)
bun run dev                     # or: pnpm dev
```

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | vite dev server with hot reload |
| `pnpm check` | Full verification: model, simulation, replay, Dafny proofs, types, tests, traces, browser explore, review |
| `pnpm gen` | Regenerates `gen/` from `spec/` |
| `pnpm accept` | Records reviewed rules in `spec/lock.json` |
| `pnpm doctor` | Checks Node, pnpm, Dafny, Quint, Chromium, and skill links |

## Layout

| Path | What |
| --- | --- |
| `spec/` | The product: stories, rules and Quint machines, one tree rooted at `spec/index.md` |
| `apps/app/` | The application: VibeLang server + React areas in `src/web/areas/` |
| `packages/design-system/` | Sonnely's design tokens (oklch palette, Geist fonts) |
| `packages/ui/` | Shared shadcn-style components |
| `packages/vibestack/` | Vendored [Vibestack](https://github.com/lalalune/vibestack) compiler and tooling (upstream, MIT) |
