// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { FunctionReturnType } from "./convex-server.ts";
import type { api } from "./convex-api.ts";
import { Pill } from "./admin/ui.tsx";
import { request } from "./wallet";

const capacityCopy: Record<string, string> = {
  disabled: "Coming soon.",
  ready: "Paid Boat capacity is available.",
  checkout: "Boat requires subscription checkout.",
  unpaid: "Boat needs a first plan payment.",
  overage: "Boat would charge a start overage.",
  capacity: "Boat has no eligible small VM capacity.",
  unavailable: "Boat capacity could not be verified.",
  unconfigured: "A Boat key is required in Convex.",
};
const capacityTone: Record<string, "ok" | "warn" | "error" | "muted"> = {
  disabled: "muted",
  ready: "ok",
  checkout: "warn",
  unpaid: "warn",
  overage: "warn",
  capacity: "error",
  unavailable: "error",
  unconfigured: "error",
};

export function AdminBoatCapacity() {
  type Status = FunctionReturnType<typeof api.computeCapacity.status>;
  const [result, setResult] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setBusy(true);
    setError("");
    try {
      setResult(await request<Status>("compute?admin=capacity"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Boat capacity could not be verified.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="button quiet" type="button" disabled={busy} onClick={() => void check()}>
        {busy && <Loader2 size={14} className="spin" aria-hidden="true" />}
        {busy ? "Checking Boat…" : "Check Boat capacity"}
      </button>
      {result && (
        <p className="caption" role="status">
          <Pill tone={capacityTone[result.state] ?? "muted"}>{result.state}</Pill>{" "}
          {capacityCopy[result.state]} Dry Dock starts are {result.enabled ? "enabled" : "paused"}.
          {result.active !== null &&
            result.limit !== null &&
            ` ${result.active} of ${result.limit} sandbox slots in use.`}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
