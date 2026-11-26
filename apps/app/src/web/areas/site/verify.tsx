// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight, Fingerprint, ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Input, Textarea } from "@repo/ui";
import type { ReceiptEnvelope } from "./receipt.ts";
import {
  compareReceiptBytes,
  maxReceiptBytes,
  parseReceiptInput,
  verifyReceiptEvidence,
} from "./receipt.ts";
import { creditBalance, providerNames, providerOfSlug } from "./data.ts";
import { SiteLead } from "./chrome.tsx";
import { buttonAccent, buttonQuiet, monoSm, panel, textLink, wrap } from "./ui.ts";

const nearDocs = "https://docs.near.ai/cloud/verification/cloud-api/response-signatures";
const phalaDocs = "https://phala.com/confidential-ai-models/verification";
const tinfoilDocs = "https://docs.tinfoil.sh/guides/verification-center";

type Inspection = ReceiptEnvelope & {
  evidence: Awaited<ReturnType<typeof verifyReceiptEvidence>>;
  requestMatch?: boolean;
  responseMatch?: boolean;
};

function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-2.5 rounded-md border border-border bg-secondary p-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={monoSm + " break-all text-end"}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceSummary({ receipt, evidence }: Pick<Inspection, "receipt" | "evidence">) {
  let label: string;
  let description: string;
  let source: string;
  let details: [string, ReactNode][] = [];

  if (receipt.provider === "near-ai") {
    source = nearDocs;
    description =
      "Hardware binding requires a verified preflight attestation with the matching signer and algorithm, retained before inference.";
    switch (evidence) {
      case "signature_matched":
        label = "Signed hashes and declared signer match";
        break;
      case "invalid_signature":
        label = "Signature or signer does not match";
        break;
      case "payload_mismatch":
        label = "Signed payload does not match";
        break;
      default:
        label = "Response signature unavailable";
    }
    if (receipt.evidence.status === "signature_matched") {
      details = [
        ["Declared signer", receipt.evidence.signing_address],
        ["Signing algorithm", "ECDSA"],
        [
          "Signed scope",
          receipt.evidence.signature_kind === "provider_tee" ? "Model and hashes" : "Gateway hashes",
        ],
      ];
    }
  } else if (receipt.provider === "phala") {
    source = phalaDocs;
    label = "Phala ACI payload match reported";
    description =
      "Sonnely compared upstream hashes, the selected route, and session evidence retrieved over authenticated HTTPS. Independent attestation requires the provider artifacts and a verified connection.";
    details = [
      ["ACI receipt", receipt.evidence.aci_receipt_id],
      ["Operator route", receipt.evidence.operator_route],
      ["Upstream session", receipt.evidence.upstream_session_id],
      ["Workload keyset digest", receipt.evidence.aci_keyset_digest],
    ];
  } else {
    source = tinfoilDocs;
    label = "Tinfoil router verification reported";
    description =
      "Sonnely’s Tinfoil client verified the router release before sending the request. The receipt identifies that router release. A model execution claim requires evidence specific to the model workload.";
    details = [
      ["Configuration repository", receipt.evidence.config_repo],
      ["Router release digest", receipt.evidence.release_digest],
    ];
  }

  const provider = providerOfSlug[receipt.provider];
  return (
    <div className="grid gap-4 rounded-md border border-border bg-secondary p-4">
      <div className="flex gap-3">
        <Fingerprint size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
        <div>
          <strong className="text-sm font-medium">{label}</strong>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {details.length > 0 && <Details rows={details} />}
      <a className={textLink} href={source}>
        Read {provider ? providerNames[provider] : receipt.provider} verification guidance{" "}
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </div>
  );
}

function Comparison({ name, digest, match }: { name: string; digest: string; match?: boolean }) {
  return (
    <div className="grid gap-2 rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <strong className="text-sm font-medium">{name}</strong>
        <span className={monoSm + " text-muted-foreground"}>SHA-256</span>
      </div>
      <code className={monoSm + " break-all text-muted-foreground"}>{digest}</code>
      {match !== undefined && (
        <p data-result={match ? "match" : "mismatch"} className={match ? "text-ok text-sm" : "text-warn text-sm"}>
          {match ? "File matches the receipt hash" : "File does not match the receipt hash"}
        </p>
      )}
    </div>
  );
}

function ReceiptInspector() {
  const [receiptText, setReceiptText] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | undefined>();
  const [requestFile, setRequestFile] = useState<File | undefined>();
  const [responseFile, setResponseFile] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const [inspection, setInspection] = useState<Inspection>();
  const [error, setError] = useState("");

  function clearResult() {
    setInspection(undefined);
    setError("");
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    clearResult();
    try {
      if (receiptFile && receiptFile.size > maxReceiptBytes)
        throw new Error("Choose a receipt or response smaller than 4 MB.");
      if (receiptText.trim() && receiptFile)
        throw new Error("Use either the pasted receipt or the selected file.");
      const envelope = parseReceiptInput(receiptFile ? await receiptFile.text() : receiptText);
      const [evidence, requestMatch, responseMatch] = await Promise.all([
        verifyReceiptEvidence(envelope.receipt),
        requestFile && compareReceiptBytes(requestFile, envelope.receipt.upstream_request_sha256),
        responseFile &&
          compareReceiptBytes(responseFile, envelope.receipt.upstream_response_sha256),
      ]);
      setInspection({ ...envelope, evidence, requestMatch, responseMatch });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not inspect the receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verify-grid">
      <form className={panel + " verify-panel grid gap-4"} onSubmit={(event) => void inspect(event)}>
        <div className="verify-panel-head">
          <h2>Completion receipt</h2>
          <p>Use a receipt, a JSON completion response, or a stream containing a receipt.</p>
        </div>
        <fieldset className="grid gap-4 disabled:opacity-60" disabled={busy}>
          <div className="grid gap-1.5">
            <label htmlFor="receipt-json" className="text-sm font-medium">
              Paste receipt or response
            </label>
            <Textarea
              id="receipt-json"
              rows={7}
              autoComplete="off"
              spellCheck={false}
              value={receiptText}
              onChange={(event) => {
                setReceiptText(event.target.value);
                clearResult();
              }}
              placeholder='{"sonnely_receipt": {…}}'
              className={monoSm}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="receipt-file" className="text-sm font-medium">
              Or choose a receipt file
            </label>
            <Input
              id="receipt-file"
              type="file"
              onChange={(event) => {
                setReceiptFile(event.target.files?.[0]);
                clearResult();
              }}
            />
          </div>
          <details className="verify-files">
            <summary className="cursor-pointer text-sm font-medium">
              Compare exact upstream files
            </summary>
            <p className="text-sm text-muted-foreground">
              Use the original bytes exchanged between Sonnely and the provider. The gateway
              rewrites API responses and stream events before returning them to you.
            </p>
            <div className="grid gap-1.5">
              <label htmlFor="upstream-request" className="text-sm font-medium">
                Upstream request body
              </label>
              <Input
                id="upstream-request"
                type="file"
                onChange={(event) => {
                  setRequestFile(event.target.files?.[0]);
                  clearResult();
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="upstream-response" className="text-sm font-medium">
                Upstream response body
              </label>
              <Input
                id="upstream-response"
                type="file"
                onChange={(event) => {
                  setResponseFile(event.target.files?.[0]);
                  clearResult();
                }}
              />
            </div>
          </details>
          <div className="verify-actions flex flex-wrap gap-3">
            <button className={buttonAccent} type="submit">
              {busy ? "Inspecting…" : "Inspect receipt"}
            </button>
            <button
              className={buttonQuiet}
              type="reset"
              onClick={() => {
                setReceiptText("");
                setReceiptFile(undefined);
                setRequestFile(undefined);
                setResponseFile(undefined);
                clearResult();
              }}
            >
              Clear
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="rounded-md border border-warn/40 bg-warn/10 p-3.5 text-sm text-warn" role="alert">
            {error}
          </p>
        )}
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck size={16} aria-hidden="true" /> The receipt and files stay in this browser.
        </p>
      </form>
      <section className={panel + " verify-panel grid gap-4"} aria-labelledby="verification-result">
        <div className="verify-panel-head">
          <h2 id="verification-result">Inspection results</h2>
          <p role="status">
            {inspection
              ? "Receipt format validated."
              : busy
                ? "Checking receipt evidence…"
                : "Results appear after inspection."}
          </p>
        </div>
        {inspection ? (
          <>
            <EvidenceSummary receipt={inspection.receipt} evidence={inspection.evidence} />
            <Details
              rows={[
                [
                  "Provider",
                  providerOfSlug[inspection.receipt.provider]
                    ? providerNames[providerOfSlug[inspection.receipt.provider]!]
                    : inspection.receipt.provider,
                ],
                ["Model ID", inspection.receipt.requested_model],
                ...(inspection.receipt.reported_model
                  ? ([["Reported model", inspection.receipt.reported_model]] satisfies [
                      string,
                      ReactNode,
                    ][])
                  : []),
                ...(inspection.requestId
                  ? ([
                      [
                        "Sonnely request",
                        <a
                          key="request"
                          className={textLink}
                          href={
                            "/console/logs?request=" + encodeURIComponent(inspection.requestId)
                          }
                        >
                          {inspection.requestId}
                        </a>,
                      ],
                    ] satisfies [string, ReactNode][])
                  : []),
                ["Provider completion", inspection.receipt.provider_completion_id],
                ["Charge in receipt", creditBalance(inspection.receipt.charged_microusd)],
              ]}
            />
            <div className="grid gap-3">
              <Comparison
                name="Upstream request"
                digest={inspection.receipt.upstream_request_sha256}
                match={inspection.requestMatch}
              />
              <Comparison
                name="Upstream response"
                digest={inspection.receipt.upstream_response_sha256}
                match={inspection.responseMatch}
              />
            </div>
          </>
        ) : (
          <div className="grid gap-5">
            <div className="verify-note">
              <h3 className="text-sm font-medium">Get a receipt in three steps</h3>
              <ol className="verify-steps">
                <li>
                  Enable <strong className="text-foreground">Include verification receipt</strong>{" "}
                  in Playground, or send <code className={monoSm}>X-Sonnely-Receipt: v1</code>{" "}
                  with an API Chat Completions request.
                </li>
                <li>
                  Copy the <code className={monoSm}>sonnely_receipt</code> object from the JSON
                  completion, save the response, or keep the stream events.
                </li>
                <li>Paste it or choose the file here. Inspection runs entirely in this browser.</li>
              </ol>
              <a className={textLink + " mt-2"} href="/docs/attestation#completion-receipts">
                Read the receipt guide <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="verify-note">
              <h3 className="text-sm font-medium">What inspection checks</h3>
              <ul className="verify-checks">
                <li>The receipt is a supported Sonnely v1 receipt for a known provider route.</li>
                <li>
                  NEAR AI signatures are verified locally against the declared signer and the
                  request and response hashes.
                </li>
                <li>
                  Phala and Tinfoil evidence identifies the verified router release or session the
                  route reported.
                </li>
                <li>
                  Optional upstream files are hashed in this browser and compared with the receipt
                  digests.
                </li>
              </ul>
            </div>
            <div className="verify-note">
              <h3 className="text-sm font-medium">Gateway boundary</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Sonnely reads the request at its HTTPS gateway. The provider’s trusted execution
                environment serves the model. A receipt is evidence about the route, not proof of
                end-to-end encryption.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function VerifyPage() {
  return (
    <div className={wrap + " inner-page market-page"}>
      <SiteLead
        title="Verify an inference receipt"
        description="Review what the serving route reported and check supported signatures and file hashes on this device."
        back={["/docs/attestation", "Attestation guide"]}
      />
      <ReceiptInspector />
    </div>
  );
}
