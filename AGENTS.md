<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git workflow

- For every completed change in this repository, commit it on a `codex/` branch, push the branch, open a pull request against the default branch, and merge it after the required checks and reviews pass. Verify the merge before reporting completion.

## Solana development

- Use the [Solana Developer MCP](https://mcp.solana.com/#tools) for current Solana guidance. Start non-trivial tasks with `list_sections`, then use `get_documentation` for the relevant source IDs or `Solana_Documentation_Search` for a focused question. The configured remote server is `https://mcp.solana.com/mcp`. If unavailable, use official Solana, Solana Mobile, or library release documentation and report the fallback.
- Use Kit and the generated System and Token program clients. Use the Kit wallet plugin with `@solana/react` for Wallet Standard discovery, connection, and signing. Register Mobile Wallet Adapter on supported Android browsers. Use v1 for new transfers when the wallet supports it and v0 otherwise. Read historical transaction formats when verifying payments.
- If a future change adds or modifies Anchor or Pinocchio Rust, run `program_autofixer`, apply the findings, and repeat until the tool says another pass is unnecessary.
- Keep Solana signatures and transactions bound to the selected wallet and network. Verify the recipient, reference, asset, and exact amount before crediting a finalized transfer. Billing tests should cover native SOL, SPL USDC, retries, and history recovery. Use fixtures or unsigned simulation for mainnet checks.
