# Billing

How a workspace pays for inference: deposits of SOL or USDC on Solana fund a
credit balance, and inference charges draw it down. Money moves only when a
transfer the configured cluster has finalized matches a payment intent's
wallet, asset and exact amount, carrying its reference.

- [Ledger](./ledger.md): the credit balance and its append-only entry log.
- [Deposits](./deposits.md): Solana payment intents and how a finalized
  transfer becomes credit.
