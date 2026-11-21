"use client";

import Link from "next/link";
import { useState } from "react";
import { termsVersion } from "@/lib/policy";
import { request } from "./wallet";

export function TermsAcceptance({ refresh }: { refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel stack-panel" aria-labelledby="workspace-terms">
      <h2 id="workspace-terms">Review the Sonnely terms</h2>
      <p>Accept the current terms to add credits or run live inference.</p>
      <form
        className="recovery-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await request("accept-terms", { version: termsVersion, accepted: true });
            await refresh();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not save acceptance.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          <input type="checkbox" required /> I agree to the <Link href="/terms">Terms of Service</Link> and
          have read the <Link href="/privacy">Privacy Notice</Link>.
        </label>
        <button className="button accent" disabled={busy}>
          {busy ? "Saving…" : "Accept terms"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
