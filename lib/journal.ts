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
      "The wallet funding page shows a Solana Pay request when a treasury is configured. Each request has a unique reference and a fixed USDC amount. Your wallet shows the transfer before you authorize it. On Seeker, you can connect through Mobile Wallet Adapter in Android Chrome. A Solana Pay link and QR code are available from checkout.",
      "The account receives credits once Sonnely verifies a finalized mainnet payment with the matching wallet, token, amount, recipient, and reference. Billing checks automatically while the payment is open. Resume a pending payment from history if you close the page. Devnet payments support testing without creating spendable credits.",
      "NEAR Intents provides a separate SOL-to-USDC estimate. The quote preview neither initiates a swap nor funds an account.",
    ],
  },
  {
    slug: "choose-a-model",
    title: "Choose a model with a small evaluation",
    category: "Guide",
    summary: "Compare the same text workload across models before giving one a production budget.",
    body: [
      {
        heading: "Build a small set",
        paragraphs: [
          "Collect a few representative prompts and define what a useful answer looks like. Include one ambiguous request, one long request that fits the gateway limits and one request with an output format to follow. Use examples that are appropriate to share with a model provider.",
        ],
      },
      {
        heading: "Keep the test comparable",
        paragraphs: [
          "Keep the messages and output-token cap identical across models. Run the same test for each candidate and record format compliance, errors and output length. Use a separate key for evaluation so you can review usage afterward.",
        ],
      },
      {
        heading: "Make the tradeoff explicit",
        paragraphs: [
          "Start with the catalog’s workload suggestions. Evaluate the cheapest candidate that meets your acceptance criteria, and keep a second model in your test set for the cases it misses. Compare actual charges after the run, including cached input when reported.",
        ],
      },
    ],
    related: ["/models", "Compare models"],
  },
  {
    slug: "rotate-api-keys",
    title: "Rotate an API key without stopping a workload",
    category: "Guide",
    summary: "Replace a key safely and keep each app’s budget and usage visible.",
    body: [
      {
        heading: "Create the replacement first",
        paragraphs: [
          "Identify the caller and current key label in Usage. Create a replacement with an identifiable name and set its daily cap, lifetime budget and expiry. Copy the secret to your secrets manager when the console displays it.",
        ],
      },
      {
        heading: "Verify the deployment",
        paragraphs: [
          "Update the caller’s secret and redeploy it. When live inference is available, send a small request and review its status and key label in Usage. Roll back the caller configuration while both keys are valid if the replacement fails.",
        ],
      },
      {
        heading: "Revoke the old key",
        paragraphs: [
          "Revoke the old key once every caller uses its replacement. If a key has been exposed, revoke it immediately, then review requests and charges for its label.",
        ],
      },
    ],
    related: ["/docs#keys", "Key management guide"],
  },
  {
    slug: "read-a-request-receipt",
    title: "Read the usage ledger after an API request",
    category: "Billing",
    summary:
      "Understand the difference between an estimate, a settled charge and a reservation still awaiting usage.",
    body: [
      {
        heading: "Before a completion runs",
        paragraphs: [
          "The gateway reserves an estimated maximum charge from your balance and applicable key budget. That reservation is based on request size and the maximum output tokens allowed for the request.",
        ],
      },
      {
        heading: "After the provider responds",
        paragraphs: [
          "A complete request settles against provider-reported usage. For a provider rejection classified as failed, the reservation can be released. Timeouts or missing usage can leave a reservation awaiting reconciliation.",
        ],
      },
      {
        heading: "Before sending it again",
        paragraphs: [
          "Check the latest usage entry and its status. A transport timeout alone cannot tell you whether a completion ran upstream. Include the approximate time and model ID if you need help reconciling an entry.",
        ],
      },
    ],
    related: ["/docs#errors", "Errors and recovery"],
  },
];
