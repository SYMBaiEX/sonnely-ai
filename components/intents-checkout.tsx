"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "./shared";

export function IntentsCheckout({
  url,
  wallet,
  canFund,
}: {
  url: string;
  wallet?: string;
  canFund: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel stack-panel intents-checkout" aria-labelledby="other-crypto">
      <div className="between">
        <h2 id="other-crypto">Fund with other crypto</h2>
        <span className="pill">NEAR Intents</span>
      </div>
      {!wallet ? (
        <p className="caption">Connect your Solana wallet to start a swap.</p>
      ) : (
        <>
          <p className="caption">
            In NEAR Intents, select USDC on Solana and enter this recipient address. When the USDC arrives,
            use <a href="#buy-credits">Buy credits</a>.
          </p>
          <div className="intents-recipient">
            <code>{wallet}</code>
            <CopyButton value={wallet} label="Copy Solana address" />
          </div>
          {open && canFund ? (
            <>
              <iframe
                className="intents-widget"
                title="NEAR Intents swap"
                src={url}
                referrerPolicy="no-referrer"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                allow="clipboard-write"
              />
              <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">
                Open NEAR Intents in a new tab <ArrowUpRight size={16} aria-hidden />
              </a>
            </>
          ) : (
            <button type="button" className="button quiet" onClick={() => setOpen(true)} disabled={!canFund}>
              Open NEAR Intents <ArrowUpRight size={16} aria-hidden />
            </button>
          )}
        </>
      )}
    </section>
  );
}
