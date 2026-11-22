import Link from "next/link";
import { Activity, ArrowUpRight, KeyRound, Wallet } from "lucide-react";

function KeyPreview() {
  return (
    <>
      <p className="mono preview-name">docs-assistant</p>
      <dl>
        <div>
          <dt>Daily cap</dt>
          <dd>$5.00</dd>
        </div>
        <div>
          <dt>Lifetime cap</dt>
          <dd>$75.00</dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>30 days</dd>
        </div>
      </dl>
    </>
  );
}

function UsagePreview() {
  return (
    <>
      <p className="mono preview-name">GLM 5.3 Flash</p>
      <div className="preview-usage-bar" aria-hidden="true">
        <span />
        <span />
      </div>
      <dl>
        <div>
          <dt>Input tokens</dt>
          <dd>1,240</dd>
        </div>
        <div>
          <dt>Output tokens</dt>
          <dd>186</dd>
        </div>
        <div>
          <dt>Charge</dt>
          <dd>$0.000193</dd>
        </div>
      </dl>
    </>
  );
}

function PaymentPreview() {
  return (
    <>
      <p className="mono preview-name">5.00 USDC</p>
      <dl>
        <div>
          <dt>Network</dt>
          <dd>Solana mainnet</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>Finalized</dd>
        </div>
        <div>
          <dt>Compute credits</dt>
          <dd>+$5.00</dd>
        </div>
      </dl>
    </>
  );
}

const cards = [
  {
    id: "keys",
    previewTitle: "API key",
    icon: KeyRound,
    title: "Give each app its own key",
    description: "Set daily and lifetime caps, choose an expiry, and revoke keys from the workspace.",
    link: "/console/keys",
    action: "Manage keys",
    Preview: KeyPreview,
  },
  {
    id: "usage",
    previewTitle: "Request ledger",
    icon: Activity,
    title: "Trace spend to a request",
    description: "See which model and key ran a request, along with its token counts and charge.",
    link: "/console/usage",
    action: "View usage",
    Preview: UsagePreview,
  },
  {
    id: "funding",
    previewTitle: "Solana Pay receipt",
    icon: Wallet,
    title: "Fund from a Solana wallet",
    description: "When checkout is enabled, fund credits with USDC and verify the finalized transfer.",
    link: "/docs/billing",
    action: "See how settlement works",
    Preview: PaymentPreview,
  },
];

export function WorkspacePreview() {
  return (
    <section className="section" aria-labelledby="workspace-title">
      <div className="section-head">
        <h2 id="workspace-title">Keys, usage, and credits.</h2>
        <Link className="text-link" href="/pricing">
          See pricing <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="workspace-previews">
        {cards.map(({ id, previewTitle, icon: Icon, title, description, link, action, Preview }) => (
          <article className="workspace-preview" key={id}>
            <div className={"workspace-visual workspace-visual-" + id}>
              <img src={"/homepage/" + id + ".webp"} alt="" width={840} height={560} loading="lazy" />
              <figure className="preview-data glass">
                <figcaption>
                  <Icon size={15} aria-hidden /> <strong>{previewTitle}</strong>
                  <small>Example</small>
                </figcaption>
                <Preview />
              </figure>
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
            <Link className="text-link" href={link}>
              {action} <ArrowUpRight size={16} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
