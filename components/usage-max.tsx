"use client";

import { ArrowUpRight, Download } from "lucide-react";
import { useState, type FormEvent } from "react";
import { request } from "./wallet";

export function UsageMax({ days, hasUsage }: { days: number; hasUsage: boolean }) {
  const [device, setDevice] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const deviceStorage = "sonnely.usagemax-device";

  function installId() {
    if (device) return;
    try {
      setDevice(localStorage.getItem(deviceStorage) ?? crypto.randomUUID());
    } catch {
      setDevice(crypto.randomUUID());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = String(new FormData(form).get("collector") ?? "");
    setPending(true);
    setNotice("");
    setError("");
    try {
      const result = await request<{ sent: number }>("usage-max", { token, device, days });
      try {
        localStorage.setItem(deviceStorage, device);
      } catch {
        /* Optional preference. */
      }
      setNotice(
        result.sent
          ? `UsageMax accepted the export of ${result.sent} settled requests.`
          : "There is no settled inference usage in this period.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to export usage.");
    } finally {
      form.reset();
      setPending(false);
    }
  }

  return (
    <section className="panel stack-panel usage-max" aria-labelledby="usagemax-heading">
      <div className="between controls">
        <div>
          <h2 id="usagemax-heading">Export to UsageMax</h2>
          <p className="caption">
            Take up to 100 settled requests from the selected date range into your UsageMax workspace.
          </p>
        </div>
        <a href="https://usagemax.com/docs" target="_blank" rel="noreferrer" className="button quiet">
          UsageMax docs <ArrowUpRight size={15} aria-hidden />
        </a>
      </div>
      {hasUsage ? (
        <>
          <div className="actions">
            <a className="button secondary" href={"/api/sonnely/usage-max?days=" + days}>
              <Download size={16} aria-hidden /> Download telemetry JSON
            </a>
          </div>
          <details
            onToggle={(event) => {
              if (event.currentTarget.open) installId();
            }}
          >
            <summary>Send to my UsageMax workspace</summary>
            <form onSubmit={submit}>
              <p className="caption">
                Create an advanced collector key in UsageMax. Each send includes model and route names, token
                counts, timestamps, and settled Sonnely charges. Sonnely uses the collector key for this send
                and never saves it.
              </p>
              <div className="usage-max-fields">
                <label className="control-label">
                  UsageMax collector key
                  <input
                    type="password"
                    name="collector"
                    autoComplete="off"
                    required
                    minLength={16}
                    maxLength={256}
                  />
                </label>
                <label className="control-label">
                  Installation ID
                  <input
                    name="device"
                    value={device}
                    onChange={(event) => setDevice(event.target.value)}
                    required
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={36}
                  />
                </label>
              </div>
              <button type="submit" className="button primary" disabled={pending}>
                {pending ? "Sending…" : "Send usage to UsageMax"}
              </button>
            </form>
          </details>
        </>
      ) : (
        <p className="caption">Completed inference requests will appear here when they settle.</p>
      )}
      {notice && (
        <p role="status" className="status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
