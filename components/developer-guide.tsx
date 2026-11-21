import Link from "next/link";
import { ArrowUpRight, BookOpen, Code2, ShieldCheck, Wallet } from "lucide-react";
import { apiBasePath, apiOrigin, limits } from "@/lib/api-contract";
import { CodeExample } from "./shared";

const sections = [
  ["quickstart", "Quickstart"],
  ["api", "API reference"],
  ["limits", "Request limits"],
  ["errors", "Errors and recovery"],
  ["keys", "Key management"],
  ["privacy", "Data handling"],
  ["verification", "Attestation"],
  ["settlement", "Payments and credits"],
] as const;

const errors = [
  [400, "Malformed JSON or unsupported fields", "Check the request format and supported fields."],
  [401, "Missing, expired or invalid key", "Check the Authorization header and the key in the console."],
  [
    402,
    "Insufficient credits or key budget",
    "Review available credits and the key’s daily and lifetime limits.",
  ],
  [404, "Unknown model ID", "Use the ID returned by the model-list endpoint."],
  [413, "Request body too large", "Reduce the amount of text or send fewer messages."],
  [415, "Unsupported media type", "Send Content-Type: application/json."],
  [429, "Account request limit", "Wait one minute before trying again."],
  [
    502,
    "Provider failure, timeout or incomplete usage",
    "Check the usage ledger before retrying. A reservation may still be held.",
  ],
  [
    503,
    "Account service or managed inference unavailable",
    "Check status in the console. Use a sample while inference is unavailable.",
  ],
] as const;

export function DeveloperGuide() {
  return (
    <>
      <div className="doc-paths" aria-label="Documentation paths">
        {(
          [
            [Code2, "Send a request", "Set up an API key and use your preferred SDK.", "#quickstart"],
            [
              ShieldCheck,
              "Verify confidential compute",
              "Understand the provider attestation and gateway boundary.",
              "#verification",
            ],
            [
              Wallet,
              "Fund your workspace",
              "Approve a USDC top-up and review payment settlement.",
              "#settlement",
            ],
          ] as const
        ).map(([Icon, title, description, href]) => (
          <a className="panel doc-path" key={href} href={href}>
            <Icon size={21} aria-hidden />
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
            <ArrowUpRight size={16} aria-hidden />
          </a>
        ))}
      </div>
      <div className="doc-grid">
        <nav aria-label="On this page" className="doc-nav">
          <p>
            <BookOpen size={16} /> On this page
          </p>
          {sections.map(([id, label]) => (
            <a key={id} href={"#" + id}>
              {label}
            </a>
          ))}
        </nav>
        <div className="doc-body">
          <section id="quickstart">
            <h2>Quickstart</h2>
            <a className="text-link" href="/api/openapi">
              OpenAPI specification
            </a>
            <ol>
              <li>
                <Link href="/console">Open the playground</Link> to try a sample or sign in with a Solana
                wallet.
              </li>
              <li>
                Create a key under <Link href="/console/keys">API keys</Link>. Save it to a secrets manager
                when it appears.
              </li>
              <li>
                Set <code>SONNELY_ORIGIN</code> to <code>{apiOrigin}</code> and <code>SONNELY_API_KEY</code>{" "}
                to your key. Live requests require managed inference and available credits.
              </li>
            </ol>
            <CodeExample />
          </section>
          <section id="api">
            <h2>API reference</h2>
            <p>
              Base URL <code>{apiOrigin + apiBasePath}</code>
            </p>
            <dl className="reference-list">
              <div>
                <dt>
                  <code>GET /models</code>
                </dt>
                <dd>
                  Public model discovery. Each entry includes the exact <code>id</code> to pass to the
                  completion endpoint.
                </dd>
              </div>
              <div>
                <dt>
                  <code>POST /chat/completions</code>
                </dt>
                <dd>
                  Send JSON with <code>Authorization: Bearer $SONNELY_API_KEY</code>. Pass <code>model</code>,{" "}
                  <code>messages</code>, and optionally <code>max_tokens</code> and <code>stream: false</code>
                  .
                </dd>
              </div>
            </dl>
            <p>
              Read text from <code>choices[0].message.content</code> and token counts from <code>usage</code>.
              Use clients that support non-streaming Chat Completions with text messages. Streaming, tool
              calls, multimodal inputs and the Responses API are outside this API’s current contract.
            </p>
          </section>
          <section id="limits">
            <h2>Request limits</h2>
            <dl className="reference-list">
              <div>
                <dt>Body</dt>
                <dd>
                  {limits.bodyBytes.toLocaleString("en-US")} bytes of JSON, including text and formatting.
                </dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>
                  Up to {limits.messages}, each with role <code>system</code>, <code>user</code> or{" "}
                  <code>assistant</code> and a text string up to{" "}
                  {limits.charactersPerMessage.toLocaleString("en-US")} characters.
                </dd>
              </div>
              <div>
                <dt>Output tokens</dt>
                <dd>
                  {limits.defaultOutputTokens} by default, configurable from 1 to{" "}
                  {limits.maxOutputTokens.toLocaleString("en-US")}.
                </dd>
              </div>
            </dl>
            <p>
              Provider context windows in the <Link href="/models">catalog</Link> describe the models. Every
              request through Sonnely is subject to the gateway limits above.
            </p>
          </section>
          <section id="errors">
            <h2>Errors and recovery</h2>
            <p>
              Read <code>error.message</code> for the specific issue returned by the gateway.
            </p>
            <div className="content-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Meaning</th>
                    <th scope="col">What to do</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map(([status, meaning, action]) => (
                    <tr key={status}>
                      <th scope="row">{status}</th>
                      <td>{meaning}</td>
                      <td>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section id="keys">
            <h2>Key management</h2>
            <p>
              Give each app or task its own key so you can track usage separately. Set a daily budget, a
              lifetime budget and an expiry as needed. Daily budgets reset at midnight UTC. Create and verify
              a replacement before revoking the old key during a rotation.
            </p>
            <Link className="text-link" href="/console/keys">
              Manage keys <ArrowUpRight size={16} />
            </Link>
          </section>
          <section id="privacy">
            <h2>Data handling</h2>
            <p>
              HTTPS protects requests in transit to the Sonnely gateway. The gateway reads prompts for
              validation and forwards them to NEAR AI Cloud. Account and usage records include the wallet
              identity, model, key label, token counts, request status and charges. The ledger excludes prompt
              and response text.
            </p>
            <p>
              Optional chat history is stored in this browser. Manage it in{" "}
              <Link href="/console/settings">Settings</Link> and clear it on shared devices.
            </p>
          </section>
          <section id="verification">
            <h2>Attestation</h2>
            <p>
              NEAR AI publishes hardware evidence for its Private TEE model tier. Check the provider’s
              evidence and assess the Sonnely gateway separately. Through this gateway, clients do not receive
              end-to-end encryption or per-response attestation verification.
            </p>
            <a className="text-link" href="https://docs.near.ai/cloud/verification">
              NEAR AI verification guide <ArrowUpRight size={16} />
            </a>
          </section>
          <section id="settlement">
            <h2>Payments and credits</h2>
            <p>
              Start in <Link href="/console/billing">Billing</Link>. Eligible accounts can buy credits in any
              positive USDC amount with up to six decimal places. Review the network, amount and recipient
              before approving. Your wallet pays the SOL network fee and any token account setup.
            </p>
            <ol>
              <li>
                On Seeker, open Sonnely in Android Chrome and select <strong>Solana mobile wallet</strong>{" "}
                when you connect. Select the account you use for Sonnely.
              </li>
              <li>
                Continue to payment and choose <strong>Pay with connected wallet</strong>. Approve the
                transfer in your wallet. You can also use a Solana Pay link or scan the QR on another device.
              </li>
              <li>
                Credits post automatically after the transfer finalizes. To continue later, choose{" "}
                <strong>Resume payment</strong> in Billing. If needed, check a transaction signature manually.
              </li>
            </ol>
            <p>
              Verified mainnet payments create spendable credits. NEAR Intents provides informational quotes.
            </p>
            <Link className="text-link" href="/pricing">
              Read the pricing and settlement guide <ArrowUpRight size={16} />
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
