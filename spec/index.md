# Sonnely

Confidential AI inference on Solana. Sonnely is an open-source gateway for
confidential model inference: stream completions through an OpenAI-compatible
API, set spending limits on API keys, and see token usage and exact charges in
a workspace.

A visitor signs in with a Solana wallet. Wallet signatures establish workspace
sessions. Finalized USDC payments and native SOL on Solana fund credits
through Solana Pay, and inference is paid from the credit balance. Sonnely has
no project token.

- [App](./app/) — the Sonnely application in `apps/app`: the public site, the
  documentation, the console, and the inference API.
