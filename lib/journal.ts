export const articles = [
  {
    slug: "request-path",
    title: "Follow an inference request",
    category: "Architecture",
    summary: "Where your prompt travels and which details Sonnely keeps.",
    body: [
      "When you send a message in the console, your browser sends it over HTTPS to Sonnely. The Sonnely server reads the request in order to validate it, reserve credits, and forward it to NEAR AI Cloud.",
      "The catalog uses models that NEAR AI lists under Private TEE. This tier describes the provider’s execution environment. The Sonnely server is a separate trust boundary. The standard Sonnely gateway does not provide client-to-model end-to-end encryption.",
      "The account ledger stores the model ID, API key label, token counts, request status, and charge. Prompts and responses are excluded from the ledger. If you enable chat history, the console stores it in your browser.",
    ],
  },
  {
    slug: "wallet-identity",
    title: "A wallet as your workspace identity",
    category: "Solana",
    summary: "How message signing opens a workspace without creating a password.",
    body: [
      "Connect a compatible Solana wallet and review the sign-in message. It contains the site's domain, a single-use nonce, and a short expiration. The wallet signs the message without broadcasting a transaction.",
      "Sonnely verifies your signature and creates a session. Your wallet address identifies the account. A separate API key can give a script access without exposing the wallet or the browser session.",
      "Use separate keys for separate workloads. Set expiry and budget limits when you create a key. Revoke a key from the console when you no longer need it.",
    ],
  },
  {
    slug: "credits-and-quotes",
    title: "How wallet funding works",
    category: "Billing",
    summary: "What happens between a USDC payment request and a credit entry.",
    body: [
      "The wallet funding page shows a Solana Pay request when a treasury is configured. Each request has a unique reference and a fixed USDC amount. Your wallet shows the transfer before you authorize it.",
      "The account receives credits once Sonnely verifies a finalized mainnet payment with the matching wallet, token, amount, recipient, and reference. Devnet payments support testing without creating spendable credits.",
      "NEAR Intents provides a separate SOL-to-USDC estimate. The quote preview neither initiates a swap nor funds an account.",
    ],
  },
];
