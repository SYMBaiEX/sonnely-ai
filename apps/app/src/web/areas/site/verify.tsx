// spec/app/site/index.md, "Story: Check the service status"
import { ArrowUpRight, Fingerprint, ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Card, Input, Label, Textarea } from "@repo/ui";
import type { ReceiptEnvelope } from "./receipt.ts";
import {
  compareReceiptBytes,
  maxReceiptBytes,
  parseReceiptInput,
  verifyReceiptEvidence,
} from "./receipt.ts";
import { creditBalance, providerNames, providerOfSlug } from "./data.ts";
import { CorrespondenceHero } from "./chrome.tsx";
import { monoSm, textLink } from "./ui.ts";

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
        <div key={label} className="flex justify-between gap-4 text-ui">
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
          <strong className="text-ui font-medium">{label}</strong>
          <p className="mt-1 text-ui text-muted-foreground">{description}</p>
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
        <strong className="text-ui font-medium">{name}</strong>
        <span className={monoSm + " text-muted-foreground"}>SHA-256</span>
      </div>
      <code className={monoSm + " break-all text-muted-foreground"}>{digest}</code>
      {match !== undefined && (
        <p data-result={match ? "match" : "mismatch"} className={match ? "text-ok text-ui" : "text-warn text-ui"}>
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
    <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-7">
      <Card className="gap-4"><form className="grid gap-4" onSubmit={(event) => void inspect(event)}>
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <span className="font-mono text-micro uppercase tracking-micro text-primary">Completion receipt</span>
            <h2 className="mt-1 [font-family:var(--font-serif)] text-heading font-medium tracking-tight">Inspect a receipt</h2>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/40 text-primary" aria-hidden="true"><Fingerprint size={20} /></span>
        </header>
        <p className="text-ui text-muted-foreground">Use a receipt, a JSON completion response, or a stream containing a receipt.</p>
        <fieldset className="grid gap-4 disabled:opacity-60" disabled={busy}>
          <div className="grid gap-1.5">
            <Label htmlFor="receipt-json">
              Paste receipt or response
            </Label>
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
            <Label htmlFor="receipt-file">
              Or choose a receipt file
            </Label>
            <Input
              id="receipt-file"
              type="file"
              className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-ui file:text-foreground"
              onChange={(event) => {
                setReceiptFile(event.target.files?.[0]);
                clearResult();
              }}
            />
          </div>
          <details className="group grid gap-3 border-y border-border py-4">
            <summary className="flex cursor-pointer items-center gap-2 text-ui font-medium">
              Compare exact upstream files
            </summary>
            <p className="text-ui text-muted-foreground">
              Use the original bytes exchanged between Sonnely and the provider. The gateway
              rewrites API responses and stream events before returning them to you.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="upstream-request">
                Upstream request body
              </Label>
              <Input
                id="upstream-request"
                type="file"
                className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-ui file:text-foreground"
                onChange={(event) => {
                  setRequestFile(event.target.files?.[0]);
                  clearResult();
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="upstream-response">
                Upstream response body
              </Label>
              <Input
                id="upstream-response"
                type="file"
                className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-ui file:text-foreground"
                onChange={(event) => {
                  setResponseFile(event.target.files?.[0]);
                  clearResult();
                }}
              />
            </div>
          </details>
          <div className="mt-1 flex flex-wrap gap-3">
            <Button type="submit" className="rounded-full">
              {busy ? "Inspecting…" : "Inspect receipt"}
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
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
            </Button>
          </div>
        </fieldset>
        {error && (
          <p className="rounded-md border border-warn/40 bg-warn/10 p-3.5 text-ui text-warn" role="alert">
            {error}
          </p>
        )}
        <p className="inline-flex items-center gap-1.5 text-ui text-muted-foreground">
          <ShieldCheck size={16} aria-hidden="true" /> The receipt and files stay in this browser.
        </p>
      </form></Card>
      <Card asChild className="gap-4" aria-labelledby="verification-result"><section>
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <span className="font-mono text-micro uppercase tracking-micro text-primary">Inspection results</span>
            <h2 id="verification-result" className="mt-1 [font-family:var(--font-serif)] text-heading font-medium tracking-tight">What the receipt shows</h2>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/40 text-primary" aria-hidden="true"><ShieldCheck size={20} /></span>
        </header>
        <p role="status" className="text-ui text-muted-foreground">
          {inspection
            ? "Receipt format validated."
            : busy
              ? "Checking receipt evidence…"
              : "Results appear after inspection."}
        </p>
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
            <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <h3 className="text-ui font-medium">Get a receipt in three steps</h3>
              <ol className="mt-2 grid list-decimal gap-2 pl-5 text-meta text-muted-foreground marker:text-primary">
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
            <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <h3 className="text-ui font-medium">What inspection checks</h3>
              <ul className="mt-2 grid list-disc gap-2 pl-5 text-meta text-muted-foreground marker:text-primary">
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
            <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <h3 className="text-ui font-medium">Gateway boundary</h3>
              <p className="mt-1 text-ui text-muted-foreground">
                Sonnely reads the request at its HTTPS gateway. The provider’s trusted execution
                environment serves the model. A receipt is evidence about the route, not proof of
                end-to-end encryption.
              </p>
            </div>
          </div>
        )}
      </section></Card>
    </div>
  );
}

export function VerifyPage() {
  return (
    <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 pb-16 md:px-8 xl:px-12">
      <CorrespondenceHero
        eyebrow="Receipt verification · Sonnely"
        title="Check the evidence yourself."
        description="Review what the serving route reported and verify supported signatures and file hashes on this device — nothing leaves the browser."
        brief={{
          title: "Inspection",
          rows: [
            ["Receipt format", "Sonnely v1"],
            ["Runs in", "This browser"],
            ["Signatures", "NEAR AI local"],
          ],
        }}
        actionsLabel="Verification actions"
        asideLabel="Inspection"
      >
        <a href="/docs/attestation">
          Attestation guide <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </CorrespondenceHero>
      <ReceiptInspector />
    </div>
  );
}
