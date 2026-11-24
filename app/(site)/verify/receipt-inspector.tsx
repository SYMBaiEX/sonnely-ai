"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Fingerprint, ShieldCheck } from "lucide-react";
import { providerNames } from "@/lib/provider-models";
import type { CompletionReceipt, ReceiptEnvelope } from "@/lib/completion-receipt";
import { creditBalance } from "@/lib/credit-amount";
import {
  compareReceiptBytes,
  maxReceiptBytes,
  parseReceiptInput,
  verifyReceiptEvidence,
} from "@/lib/receipt-inspector";
import styles from "./verification.module.css";

const nearDocs = "https://docs.near.ai/cloud/verification/cloud-api/response-signatures";
const phalaDocs = "https://phala.com/confidential-ai-models/verification";
const tinfoilDocs = "https://docs.tinfoil.sh/guides/verification-center";

type Inspection = ReceiptEnvelope & {
  evidence: Awaited<ReturnType<typeof verifyReceiptEvidence>>;
  requestMatch?: boolean;
  responseMatch?: boolean;
};

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

  return (
    <div className={styles.evidence}>
      <div className={styles.evidenceTitle}>
        <Fingerprint size={20} aria-hidden="true" />
        <div>
          <strong>{label}</strong>
          <p>{description}</p>
        </div>
      </div>
      {details.length > 0 && <Details rows={details} />}
      <a className="text-link" href={source}>
        Read {providerNames[receipt.provider]} verification guidance{" "}
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </div>
  );
}

function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={styles.details}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Comparison({ name, digest, match }: { name: string; digest: string; match?: boolean }) {
  return (
    <div className={styles.comparison}>
      <div>
        <strong>{name}</strong>
        <span className="mono">SHA-256</span>
      </div>
      <code>{digest}</code>
      {match !== undefined && (
        <p data-result={match ? "match" : "mismatch"}>
          {match ? "File matches the receipt hash" : "File does not match the receipt hash"}
        </p>
      )}
    </div>
  );
}

export function ReceiptInspector() {
  const receiptText = useRef<HTMLTextAreaElement>(null);
  const receiptFile = useRef<HTMLInputElement>(null);
  const requestFile = useRef<HTMLInputElement>(null);
  const responseFile = useRef<HTMLInputElement>(null);
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
      const file = receiptFile.current?.files?.[0];
      if (file && file.size > maxReceiptBytes)
        throw new Error("Choose a receipt or response smaller than 4 MB.");
      const pasted = receiptText.current?.value ?? "";
      if (pasted.trim() && file) throw new Error("Use either the pasted receipt or the selected file.");
      const envelope = parseReceiptInput(file ? await file.text() : pasted);
      const request = requestFile.current?.files?.[0];
      const response = responseFile.current?.files?.[0];
      const [evidence, requestMatch, responseMatch] = await Promise.all([
        verifyReceiptEvidence(envelope.receipt),
        request && compareReceiptBytes(request, envelope.receipt.upstream_request_sha256),
        response && compareReceiptBytes(response, envelope.receipt.upstream_response_sha256),
      ]);
      setInspection({ ...envelope, evidence, requestMatch, responseMatch });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not inspect the receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.grid}>
      <form
        className={"panel " + styles.panel}
        onSubmit={(event) => void inspect(event)}
        onReset={clearResult}
      >
        <div className={styles.panelHead}>
          <h2>Completion receipt</h2>
          <p>Use a receipt, a JSON completion response, or a stream containing a receipt.</p>
        </div>
        <fieldset className={styles.controls} disabled={busy}>
          <legend className="visually-hidden">Receipt and upstream files</legend>
          <div className={styles.field}>
            <label htmlFor="receipt-json">Paste receipt or response</label>
            <textarea
              id="receipt-json"
              ref={receiptText}
              rows={7}
              autoComplete="off"
              spellCheck={false}
              onChange={clearResult}
              placeholder='{"sonnely_receipt": {…}}'
              className="mono"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="receipt-file">Or choose a receipt file</label>
            <input id="receipt-file" type="file" ref={receiptFile} onChange={clearResult} />
          </div>
          <details className={styles.files}>
            <summary>Compare exact upstream files</summary>
            <p>
              Use the original bytes exchanged between Sonnely and the provider. The gateway rewrites API
              responses and stream events before returning them to you.
            </p>
            <div className={styles.field}>
              <label htmlFor="upstream-request">Upstream request body</label>
              <input id="upstream-request" type="file" ref={requestFile} onChange={clearResult} />
            </div>
            <div className={styles.field}>
              <label htmlFor="upstream-response">Upstream response body</label>
              <input id="upstream-response" type="file" ref={responseFile} onChange={clearResult} />
            </div>
          </details>
          <div className={styles.actions}>
            <button className="button accent" type="submit">
              {busy ? "Inspecting…" : "Inspect receipt"}
            </button>
            <button className="button quiet" type="reset">
              Clear
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className={styles.local}>
          <ShieldCheck size={16} aria-hidden="true" /> The receipt and files stay in this browser.
        </p>
      </form>
      <section className={"panel " + styles.panel} aria-labelledby="verification-result">
        <div className={styles.panelHead}>
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
                ["Provider", providerNames[inspection.receipt.provider]],
                ["Model ID", inspection.receipt.requested_model],
                ...(inspection.receipt.reported_model
                  ? [["Reported model", inspection.receipt.reported_model] satisfies [string, ReactNode]]
                  : []),
                ...(inspection.requestId
                  ? [
                      [
                        "Sonnely request",
                        <Link
                          key="request"
                          className="text-link"
                          href={"/console/logs?request=" + encodeURIComponent(inspection.requestId)}
                          prefetch={false}
                        >
                          {inspection.requestId}
                        </Link>,
                      ] satisfies [string, ReactNode],
                    ]
                  : []),
                ["Provider completion", inspection.receipt.provider_completion_id],
                ["Charge in receipt", creditBalance(inspection.receipt.charged_microusd)],
              ]}
            />
            <div className={styles.comparisons}>
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
          <div className={styles.intro}>
            <div>
              <h3>Get a receipt</h3>
              <p>
                Enable <strong>Include verification receipt</strong> before sending in Playground, or send{" "}
                <code>X-Sonnely-Receipt: v1</code> with an API Chat Completions request.
              </p>
              <Link className="text-link" href="/docs/attestation#completion-receipts">
                Read the receipt guide <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <div>
              <h3>Gateway boundary</h3>
              <p>
                Sonnely reads the request at its HTTPS gateway. The provider’s trusted execution environment
                serves the model.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
