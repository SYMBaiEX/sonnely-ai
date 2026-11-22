import Link from "next/link";
import { ArrowUpRight, BookOpen, Code2, ShieldCheck, Wallet } from "lucide-react";
import { apiBasePath, apiOrigin, limits } from "@/lib/api-contract";
import { CodeExample, CopyButton } from "./shared";

const sections = [
  ["quickstart", "Quickstart"],
  ["api", "API reference"],
  ["providers", "Provider selection"],
  ["streaming", "Streaming and usage"],
  ["limits", "Request limits"],
  ["errors", "Errors and recovery"],
  ["keys", "Key management"],
  ["privacy", "Data handling"],
  ["verification", "Attestation"],
  ["receipts", "Completion receipts"],
  ["settlement", "Payments and credits"],
  ["cloud-builds", "Dry Docks builds"],
  ["usage-export", "UsageMax export"],
  ["migration", "Migrate from the original app"],
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
                Add credits under <Link href="/console/billing">Billing</Link> before sending a live request.
              </li>
              <li>
                Set <code>SONNELY_ORIGIN</code> to <code>{apiOrigin}</code>, set <code>SONNELY_API_KEY</code>{" "}
                to your key, and run an example.
              </li>
            </ol>
            <CodeExample />
          </section>
          <section id="api">
            <h2>API reference</h2>
            <div className="doc-endpoint">
              <div>
                <p>Base URL</p>
                <code>{apiOrigin + apiBasePath}</code>
              </div>
              <CopyButton value={apiOrigin + apiBasePath} label="Copy base URL" />
            </div>
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
                  <code>messages</code>, and optionally <code>max_tokens</code> and <code>stream: true</code>.
                </dd>
              </div>
            </dl>
            <p>
              Read text from <code>choices[0].message.content</code> and token counts from <code>usage</code>.
              Use clients that support Chat Completions with text messages. Tool calls, multimodal inputs and
              the Responses API are outside this API’s current contract.
            </p>
          </section>
          <section id="providers">
            <h2>Provider selection</h2>
            <p>
              Read <code>routes</code> on each model in <code>GET /v1/models</code> to compare providers and
              their marked-up prices per million tokens. NEAR AI is the default. Set{" "}
              <code>{'{"provider":{"only":["phala"]}}'}</code> or{" "}
              <code>{'{"provider":{"only":["tinfoil"]}}'}</code> to select another available route. Sonnely
              keeps each request on the selected route.
            </p>
            <p>
              Set <code>max_cost_microusd</code> to cap the credit reservation before the provider receives
              the request. One dollar is one million micro-USD. The final charge uses reported tokens and is
              capped at the reservation.
            </p>
          </section>
          <section id="streaming">
            <h2>Streaming and usage</h2>
            <p>
              Set <code>stream: true</code> to receive text deltas over Server-Sent Events. Add{" "}
              <code>{'stream_options: {"include_usage": true}'}</code> to receive final token totals. If you
              request a receipt, the final chunk also carries <code>sonnely_receipt</code>.
            </p>
            <p>
              Treat deltas as provisional until <code>[DONE]</code>. Sonnely settles the reported usage before
              sending that marker. If the connection drops, the provider may still finish and incur a charge.
              Check Usage before retrying. A missing final provider report keeps the reservation open for
              reconciliation.
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
              validation and forwards them to the selected provider. Account and usage records include the
              wallet identity, model, key label, token counts, request status and charges. The ledger excludes
              prompt and response text.
            </p>
            <p>
              Optional chat history is stored in this browser. Manage it in{" "}
              <Link href="/console/settings">Settings</Link> and clear it on shared devices.
            </p>
          </section>
          <section id="verification">
            <h2>Attestation</h2>
            <p>
              The default NEAR AI routes use its Private TEE tier. Phala routes require a matching ACI receipt
              for a Phala-operated route with upstream verification reported by Phala. Sonnely’s HTTPS gateway
              reads the input and output. The Tinfoil SDK verifies its router and encrypts requests from
              Sonnely to that router. Comparing served model weights across providers requires separate
              evidence.
            </p>
            <a className="text-link" href="https://docs.near.ai/cloud/verification">
              NEAR AI verification guide <ArrowUpRight size={16} />
            </a>
            <a className="text-link" href="https://phala.com/confidential-ai-models/verification">
              Phala verification guide <ArrowUpRight size={16} />
            </a>
          </section>
          <section id="receipts">
            <h2>Completion receipts</h2>
            <p>
              Add <code>X-Sonnely-Receipt: v1</code> to your chat completion request to get a{" "}
              <code>sonnely_receipt</code> in the response. It includes the provider, requested model, billing
              reference, charge in millionths of a dollar and SHA-256 hashes of the exact upstream request and
              response bodies. Those bodies differ from the JSON your client sends and receives.
            </p>
            <p>
              <code>signature_matched</code> means the payload matches those hashes and the signature recovers
              the signing address reported by NEAR. NEAR identifies its signature as <code>provider_tee</code>{" "}
              or <code>gateway</code>. Hardware attestation still requires verified preflight evidence that
              binds the signing key to its deployment.
            </p>
            <p>
              On Phala, <code>aci_payload_matched</code> includes the receipt ID, keyset digest, operator
              route, and upstream session ID. Sonnely compares the hashes and reported route with the HTTPS
              response from Phala. Use Phala’s verifier to check the receipt signature and its hardware
              evidence.
            </p>
            <p>
              Keep receipts private. Their hashes can help someone confirm a guess about the request or
              response contents.
            </p>
            <p>
              Tinfoil receipts report <code>attested_router</code> and identify the verified router release.
              Their hashes cover the cleartext request supplied to the SDK and the decrypted response it
              returns.
            </p>
            <a className="text-link" href="/api/openapi">
              Read the receipt schema <ArrowUpRight size={16} />
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
          <section id="cloud-builds">
            <h2>Build a repository in Dry Docks</h2>
            <p>
              Open <Link href="/console/dry-docks">Dry Docks</Link> and enter a public GitHub repository and a
              full commit SHA, or load the pinned MDN example. Each run executes <code>npm ci</code>
              and <code>npm run build</code> in an isolated Boat VM.
            </p>
            <p>
              Review the credit hold before starting. Follow logs in the console and download an output
              archive up to 5 MiB. Dry Docks deletes the VM when the run ends and returns unused credits. The
              run receipt lists metered seconds, provider cost, fees, and released credits.
            </p>
          </section>
          <section id="usage-export">
            <h2>Export inference usage to UsageMax</h2>
            <p>
              Choose a date range in <Link href="/console/usage">Usage</Link> and export up to 100 settled
              inference requests. Download the telemetry JSON or send it to your workspace with an advanced
              UsageMax collector key. The export includes model and provider names, token counts, timestamps,
              and Sonnely charges.
            </p>
            <a className="text-link" href="https://usagemax.com/docs">
              Read the UsageMax collector guide <ArrowUpRight size={16} />
            </a>
          </section>
          <section id="migration">
            <h2>Migrate from the original app</h2>
            <p>
              The original Sonnely app and API are retired. The current gateway uses Solana wallet sign-in,
              USDC-funded credits, and its own API keys.
            </p>
            <ol>
              <li>
                Connect your Solana wallet in the <Link href="/console">console</Link>.
              </li>
              <li>
                Create a new key under <Link href="/console/keys">API keys</Link> and add credits in{" "}
                <Link href="/console/billing">Billing</Link>.
              </li>
              <li>
                Use the <a href="#api">current API base URL</a> and choose an ID from the{" "}
                <Link href="/models">model catalog</Link>.
              </li>
            </ol>
            <p>
              The current API supports streamed and non-streamed text completions. Replace any legacy media
              endpoints or CLI commands with a supported client.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
