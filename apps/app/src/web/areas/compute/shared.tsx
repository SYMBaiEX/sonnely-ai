// spec/app/compute/instances.md, "Story: Rent a confidential machine": money, status and workload helpers the sections share.
import type { Run, Workload } from "../../../../gen/app__compute__instances.ts";

const scale = 1_000_000n;

/** Micro-USD as "$1.23", the way lib/credit-amount formatted it. */
export function creditBalance(micros: number) {
  const units = BigInt(micros);
  const whole = units / scale;
  const fraction = (units % scale)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return "$" + whole + (fraction ? "." + fraction : "");
}

export const imagePattern =
  /^(?:docker\.io|ghcr\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*){0,4}@sha256:[0-9a-f]{64}$/;
export const repositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
export const revisionPattern = /^[0-9a-f]{40}$/i;

export const blackboxMachines = [
  { id: "tdx.small", label: "Small", detail: "1 vCPU · 2 GB RAM", hourly: 58_000 },
  { id: "tdx.medium", label: "Medium", detail: "2 vCPU · 4 GB RAM", hourly: 116_000 },
  { id: "tdx.large", label: "Large", detail: "4 vCPU · 8 GB RAM", hourly: 232_000 },
] as const;
export const blackboxDisks = [20, 40, 80] as const;
export const blackboxMinutes = [15, 30, 60, 120] as const;
export const dockMinutes = [5, 10, 15] as const;

export function runTitle(run: Run) {
  return run.spec.tag === "Blackbox" ? run.spec.image.split("@")[0].split("/").pop() : run.spec.repository.split("/").pop();
}

export function runStatus(run: Run) {
  if (run.phase === "Settled") {
    return { Completed: "Completed", Stopped: "Ended early", Expired: "Expired", Failed: "Failed", Ongoing: "Ended" }[
      run.result
    ];
  }
  if (run.phase === "Teardown" || run.stopRequested) return "Tearing down";
  if (run.phase === "Running") return "Running";
  if (run.phase === "Provisioning") return "Provisioning";
  return "Queued";
}

export function isLive(run: Run) {
  return run.phase !== "Settled";
}

const steps = ["Queued", "Provisioning", "Running", "Teardown", "Settled"] as const;
export function stepIndex(run: Run) {
  return steps.indexOf(run.stopRequested && run.phase !== "Settled" ? "Teardown" : run.phase);
}

export function describeWorkload(spec: Workload) {
  return spec.tag === "Blackbox"
    ? `${spec.machine} · ${spec.disk} GB SSD · port ${spec.port}`
    : `${spec.repository} @ ${spec.revision.slice(0, 7)}`;
}
