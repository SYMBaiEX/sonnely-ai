import { ArrowRight, FileCheck2 } from "lucide-react";
import { useState } from "react";

export function TermsAcceptance({ inSetup = false }: { inSetup?: boolean }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <section className={inSetup ? "terms-banner setup-terms" : "terms-banner"} aria-label="Review the Sonnely terms">
      <div className="terms-banner-layout">
        {!inSetup && (
          <div className="terms-banner-intro">
            <span className="terms-banner-icon" aria-hidden="true">
              <FileCheck2 size={20} />
            </span>
            <div>
              <h2 id="workspace-terms">Review the Sonnely terms</h2>
              <p>Accept to add credits and run live inference.</p>
            </div>
          </div>
        )}
        <form
          className="terms-banner-form"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            if (!accepted || busy) return;
            setBusy(true);
            setError("Terms acceptance is not available on this deployment yet.");
            setBusy(false);
          }}
        >
          <div className="terms-consent">
            <label className="terms-checkbox">
              <input
                type="checkbox"
                aria-labelledby="workspace-terms-consent"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                disabled={busy}
                required
              />
            </label>
            <p id="workspace-terms-consent">
              I agree to the <a href="/terms">Terms of Service</a> and have read the <a href="/privacy">Privacy Notice</a>.
            </p>
          </div>
          <button type="submit" className="button accent terms-accept" disabled={!accepted || busy}>
            {busy ? "Saving…" : "Accept terms"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          {error && (
            <p role="alert" className="error terms-banner-error">
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
