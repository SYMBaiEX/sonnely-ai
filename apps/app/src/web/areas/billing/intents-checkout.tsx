/* eslint-disable better-tailwindcss/no-unknown-classes, @eslint-react/dom-no-unsafe-iframe-sandbox -- this checkout intentionally uses the migrated billing class names and NEAR Intents requires its documented widget sandbox */
// spec/app/billing/deposits.md, "Story: Open a payment intent"
import { ArrowUpRight, Wallet } from "lucide-react";
import { CopyButton } from "./shared.tsx";

export function IntentsCheckout({
  url,
  wallet,
  unavailableReason,
}: {
  url: string;
  wallet?: string;
  unavailableReason?: string;
}) {
  return (
    <section className="panel intents-checkout" aria-labelledby="other-crypto">
      <header className="intents-header">
        <div>
          <h2 id="other-crypto">Swap crypto to fund your wallet</h2>
          <p className="caption">Turn supported tokens into USDC on Solana.</p>
        </div>
        <span className="pill">NEAR Intents</span>
      </header>
      {!wallet || unavailableReason ? (
        <p className="intents-notice caption">
          {wallet ? unavailableReason : "Connect your Solana wallet to start a swap."}
        </p>
      ) : (
        <div className="intents-body">
          <div className="intents-guide">
            <div className="intents-recipient">
              <div>
                <h3>
                  <Wallet size={17} aria-hidden /> Your Solana wallet
                </h3>
                <code>{wallet}</code>
              </div>
              <CopyButton value={wallet} label="Copy Solana address" />
            </div>
            <p className="caption">
              Paste this address into the swap’s recipient field, then <a href="#buy-credits">buy credits</a> once the
              USDC arrives.
            </p>
          </div>
          <iframe
            key={wallet}
            className="intents-widget"
            title="NEAR Intents swap"
            src={url}
            referrerPolicy="no-referrer"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            allow="clipboard-write"
          />
          <a className="text-link intents-popout" href={url} target="_blank" rel="noopener noreferrer">
            Open swap in a new tab <ArrowUpRight size={15} aria-hidden />
          </a>
        </div>
      )}
    </section>
  );
}
