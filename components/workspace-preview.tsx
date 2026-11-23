"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
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
    label: "API keys",
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
    label: "Usage",
    previewTitle: "Request ledger",
    icon: Activity,
    title: "See what a request cost",
    description:
      "Look up a request to see which model and key ran it, how many tokens it used, and what you paid.",
    link: "/console/usage",
    action: "View usage",
    Preview: UsagePreview,
  },
  {
    id: "funding",
    label: "Funding",
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
  const [active, setActive] = useState(0);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowUp":
        next = (index + cards.length - 1) % cards.length;
        break;
      case "ArrowDown":
        next = (index + 1) % cards.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = cards.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
    event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
  }

  return (
    <section className="section home-workspace" aria-labelledby="workspace-title">
      <div className="section-head">
        <h2 id="workspace-title">Keys, usage, and credits.</h2>
        <Link className="text-link" href="/pricing">
          See pricing <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="workspace-showcase" data-reveal="fade">
        <div
          className="workspace-tabs"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Workspace preview"
        >
          {cards.map(({ id, label, icon: Icon }, index) => (
            <button
              id={"workspace-tab-" + id}
              type="button"
              role="tab"
              key={id}
              aria-selected={active === index}
              aria-controls={"workspace-panel-" + id}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <Icon size={18} aria-hidden /> {label}
            </button>
          ))}
        </div>
        {cards.map(({ id, previewTitle, icon: Icon, title, description, link, action, Preview }, index) => (
          <div
            className="workspace-preview"
            id={"workspace-panel-" + id}
            role="tabpanel"
            aria-labelledby={"workspace-tab-" + id}
            hidden={index !== active}
            tabIndex={0}
            key={id}
          >
            {index === active && (
              <>
                <div className="workspace-visual">
                  <img src={"/homepage/" + id + ".webp"} alt="" width={840} height={560} loading="lazy" />
                  <figure className="preview-data">
                    <figcaption>
                      <Icon size={15} aria-hidden /> <strong>{previewTitle}</strong>
                      <small>Example</small>
                    </figcaption>
                    <Preview />
                  </figure>
                </div>
                <div className="workspace-preview-copy">
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <Link className="text-link" href={link}>
                    {action} <ArrowUpRight size={16} aria-hidden />
                  </Link>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
