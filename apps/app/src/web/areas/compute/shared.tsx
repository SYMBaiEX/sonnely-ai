// spec/app/compute/instances.md, "Story: Rent a confidential machine"
import { Check, Copy, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Run } from "../../../../gen/app__compute__instances.ts";

const scale = 1_000_000n;

export function creditDecimal(micros: number, minimumDecimals = 0) {
  const units = BigInt(micros);
  const whole = units / scale;
  const fraction = (units % scale)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return whole + (fraction ? "." + fraction : "");
}

export function creditBalance(micros: number) {
  return "$" + creditDecimal(micros, 2);
}

export const computeFee = 10_000;
export const computeMarkup = 25;
export const computeRetention = 7 * 86_400_000;
export const imagePattern =
  /^(?:docker\.io|ghcr\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*){0,4}@sha256:[0-9a-f]{64}$/;
export const repositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
export const revisionPattern = /^[0-9a-f]{40}$/i;

export function repositoryAllowed(repository: string) {
  const name = repository.split("/").at(-1) ?? "";
  return repositoryPattern.test(repository) && name !== "." && name !== ".." && !name.endsWith(".git");
}

export const blackboxMachineIds = ["tdx.small", "tdx.medium", "tdx.large"] as const;
export type BlackboxMachine = (typeof blackboxMachineIds)[number];
export const blackboxMachines = {
  "tdx.small": { name: "Small", cpu: 1, ram: 2, hourlyCompute: 58_000 },
  "tdx.medium": { name: "Medium", cpu: 2, ram: 4, hourlyCompute: 116_000 },
  "tdx.large": { name: "Large", cpu: 4, ram: 8, hourlyCompute: 232_000 },
} satisfies Record<BlackboxMachine, { name: string; cpu: number; ram: number; hourlyCompute: number }>;
export const blackboxDiskSizes = [20, 40, 80] as const;
export type BlackboxDisk = (typeof blackboxDiskSizes)[number];
export const defaultBlackboxMachine: BlackboxMachine = "tdx.small";
export const defaultBlackboxDisk: BlackboxDisk = 20;
export const blackboxDiskHourlyRate = 139;
export const blackboxMinutes = [15, 30, 60, 120] as const;
export const dockMinutes = [5, 10, 15] as const;

export function isBlackboxMachine(value: string): value is BlackboxMachine {
  return (blackboxMachineIds as readonly string[]).includes(value);
}

export function isBlackboxDisk(value: number): value is BlackboxDisk {
  return (blackboxDiskSizes as readonly number[]).includes(value);
}

export function blackboxHourlyBase(machine: string = defaultBlackboxMachine, disk: number = defaultBlackboxDisk) {
  const id = isBlackboxMachine(machine) ? machine : defaultBlackboxMachine;
  const size = isBlackboxDisk(disk) ? disk : defaultBlackboxDisk;
  return blackboxMachines[id].hourlyCompute + size * blackboxDiskHourlyRate;
}

export function blackboxSize(machine: string = defaultBlackboxMachine, disk: number = defaultBlackboxDisk) {
  const id = isBlackboxMachine(machine) ? machine : defaultBlackboxMachine;
  const size = isBlackboxDisk(disk) ? disk : defaultBlackboxDisk;
  const { cpu, ram } = blackboxMachines[id];
  return `${cpu} vCPU · ${ram} GB RAM · ${size} GB SSD`;
}

export const blackboxPresets = {
  nginx: {
    title: "NGINX web server",
    description: "Start a lightweight web server and verify that HTTPS is reachable.",
    image:
      "docker.io/nginx/nginx-unprivileged@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd",
    port: 8080,
  },
  httpbin: {
    title: "HTTP playground",
    description: "Try HTTP methods, status codes, headers, and response formats.",
    image:
      "docker.io/mccutchen/go-httpbin@sha256:873b4fdb27fe7cc66fa12cb9362574e1b0bf31df7ca8a71b2502988327a0b8a4",
    port: 8080,
  },
  whoami: {
    title: "Request inspector",
    description: "See the client and proxy headers your workload receives.",
    image: "docker.io/traefik/whoami@sha256:200689790a0a0ea48ca45992e0450bc26ccab5307375b41c84dfc4f2475937ab",
    port: 80,
  },
} as const;
export type BlackboxPreset = keyof typeof blackboxPresets;

export const blackboxAgentPresets = {
  hermes: {
    title: "Hermes Agent",
    description: "Nous Research agent gateway",
    port: 8642,
    setup:
      "Start the Hermes gateway with its HTTP API enabled on port 8642. Configure API authentication and a model provider before exposing the gateway.",
    docs: "https://hermes-agent.nousresearch.com/docs/user-guide/docker",
  },
  openclaw: {
    title: "OpenClaw",
    description: "Personal agent gateway",
    port: 18789,
    setup:
      "Configure a token-protected OpenClaw gateway on port 18789. For the Control UI, configure the allowed HTTPS origin and follow OpenClaw’s pairing instructions.",
    docs: "https://docs.openclaw.ai/install/docker",
  },
  eliza: {
    title: "ElizaOS",
    description: "Agents with characters and plugins",
    port: 3000,
    setup:
      "Package your ElizaOS agent, its character, and its plugins. Configure API authentication and make the agent server listen on the container HTTP port.",
    docs: "https://github.com/elizaos/eliza",
  },
  mastra: {
    title: "Mastra",
    description: "TypeScript agents and workflows",
    port: 4111,
    setup:
      "Build and package your Mastra server with its agents and workflows. Configure server authentication before serving its routes on port 4111.",
    docs: "https://mastra.ai/docs",
  },
  pydantic: {
    title: "Pydantic AI",
    description: "Python agents served by FastAPI",
    port: 8000,
    setup:
      "Package your agent as an authenticated FastAPI service. Bind the ASGI server to 0.0.0.0 on port 8000, or set your app’s HTTP port below.",
    docs: "https://pydantic.dev/docs/ai/examples/conversational-agents/chat-app/",
  },
} as const;
export type BlackboxAgentPreset = keyof typeof blackboxAgentPresets;

export const dryDockPlan = {
  title: "Dry Docks",
  provider: "Boat",
  size: "2 vCPU · 4 GB RAM",
  hourlyBase: 18_000,
  unitSeconds: 1,
  minutes: dockMinutes,
} as const;

export function isLive(run: Run) {
  return run.phase !== "Settled";
}

export function runStatus(run: Run) {
  if (run.phase === "Settled") {
    return { Completed: "completed", Stopped: "stopped", Expired: "expired", Failed: "failed", Ongoing: "finished" }[run.result];
  }
  if (run.phase === "Teardown" || run.stopRequested) return "tearing down";
  return run.phase.toLowerCase();
}

export function blackboxStatus(run: Run) {
  if (run.phase === "Settled") {
    return { Completed: "Completed", Stopped: "Ended early", Expired: "Expired", Failed: "Failed", Ongoing: "Completed" }[run.result];
  }
  if (run.phase === "Teardown" || run.stopRequested) return "Tearing down";
  if (run.phase === "Running") return "Running";
  if (run.phase === "Provisioning") return "Provisioning";
  return "Queued";
}

export function blackboxName(run: Run) {
  return run.spec.tag === "Blackbox" ? run.spec.image.split("@")[0] : run.id;
}

export function dockDetails(run: Run) {
  return run.spec.tag === "DryDock"
    ? run.spec.repository.replace("https://github.com/", "") + " · " + run.spec.revision.slice(0, 8)
    : run.id;
}


export async function runRequest(path: string, input: unknown) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => undefined)) as { ok?: boolean; error?: unknown } | undefined;
    if (!response.ok || body?.ok !== true) return typeof body?.error === "string" ? body.error : `request failed (HTTP ${response.status})`;
    return undefined;
  } catch (cause) {
    return cause instanceof Error ? cause.message : "request failed";
  }
}

export interface RunObservation {
  createdAt?: number;
  startedAt?: number;
  evidenceAt?: number;
  workAt?: number;
  teardownAt?: number;
  settledAt?: number;
}

export type RunObservations = Record<string, RunObservation>;

export function observeRuns(runs: Run[], observations: RunObservations, now: number) {
  let changed = false;
  const next: RunObservations = { ...observations };
  for (const run of runs) {
    const current = observations[run.id] ?? {};
    const observed: RunObservation = { ...current, createdAt: current.createdAt ?? now };
    if ((run.phase === "Provisioning" || run.phase === "Running" || run.phase === "Teardown" || run.phase === "Settled") && observed.startedAt === undefined) {
      observed.startedAt = observed.startedAt ?? now;
    }
    if (run.kind === "Blackboxes" && (run.attestation === "Verified" || run.attestation === "Rejected") && observed.evidenceAt === undefined) {
      observed.evidenceAt = now;
    }
    if (run.kind === "DryDocks" && (run.phase === "Running" || run.phase === "Teardown" || run.phase === "Settled") && observed.workAt === undefined) {
      observed.workAt = now;
    }
    if ((run.phase === "Teardown" || run.phase === "Settled") && observed.teardownAt === undefined) observed.teardownAt = now;
    if (run.phase === "Settled" && observed.settledAt === undefined) observed.settledAt = now;
    if (observations[run.id] === undefined || Object.keys(observed).some((key) => observed[key as keyof RunObservation] !== current[key as keyof RunObservation])) {
      next[run.id] = observed;
      changed = true;
    }
  }
  return changed ? next : observations;
}

export interface RunView {
  run: Run;
  times: RunObservation;
  active: boolean;
  expiresAt?: number;
  purgeAt?: number;
  endpoint?: string;
  composeHash?: string;
  hasEvidence: boolean;
  hasLog: boolean;
  hasArtifact: boolean;
  log: string;
  message?: string;
}

function stableHex(seed: string, length: number) {
  let value = 0x811c9dc5;
  let out = "";
  while (out.length < length) {
    for (const char of seed + out) {
      value ^= char.codePointAt(0) ?? 0;
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    out += value.toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

function endpointFor(run: Run) {
  const host = run.id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 28) || "workload";
  return `https://${host}.blackbox.sonnely.run/`;
}

function syntheticLog(run: Run) {
  if (run.spec.tag !== "DryDock") return "";
  const clone = [
    "$ git clone --filter=blob:none " + run.spec.repository,
    "Cloning into 'repository'...",
    "$ git checkout " + run.spec.revision,
    "HEAD is now at " + run.spec.revision.slice(0, 7),
  ];
  if (run.phase === "Queued") return clone.concat("Waiting for a clean Boat sandbox…").join("\n");
  if (run.phase === "Provisioning") return clone.concat("Provisioning a 2 vCPU · 4 GB RAM sandbox…").join("\n");
  if (run.phase === "Running" && !run.stopRequested) {
    return clone.concat("$ npm ci", "added 214 packages in 4s", "$ npm run build", "Build is running in the confidential sandbox…").join("\n");
  }
  if (run.result === "Completed") {
    return clone.concat("$ npm ci", "added 214 packages in 4s", "$ npm run build", "Build completed.", "Artifact collected from dist (2.8 MiB).").join("\n");
  }
  if (run.result === "Stopped") return clone.concat("Build cancelled; sandbox teardown requested.").join("\n");
  if (run.result === "Expired") return clone.concat("Build time limit reached; sandbox teardown started.").join("\n");
  if (run.result === "Failed") return clone.concat("Build failed; the sandbox was removed.").join("\n");
  return clone.concat("Build output ended.").join("\n");
}

export function viewRun(run: Run, times: RunObservation): RunView {
  const active = isLive(run);
  const expiresAt = active && times.startedAt !== undefined ? times.startedAt + run.minutes * 60_000 : undefined;
  const purgeAt = times.settledAt !== undefined ? times.settledAt + computeRetention : undefined;
  const evidence = run.kind === "Blackboxes" && (run.attestation === "Verified" || times.evidenceAt !== undefined);
  const endpoint =
    run.kind === "Blackboxes" && active && run.phase === "Running" && run.attestation === "Verified" && !run.stopRequested
      ? endpointFor(run)
      : undefined;
  const message =
    run.attestation === "Rejected"
      ? "The attestation evidence could not be verified. The rental was not billed."
      : run.phase === "Settled" && run.result === "Failed"
        ? "The provider reported a failure. Unused credits returned to your balance."
        : undefined;
  return {
    run,
    times,
    active,
    expiresAt,
    purgeAt,
    endpoint,
    composeHash: run.kind === "Blackboxes" && evidence ? stableHex(run.id + run.reference, 64) : undefined,
    hasEvidence: evidence,
    hasLog: run.kind === "DryDocks" && run.phase !== "Queued",
    hasArtifact: run.kind === "DryDocks" && run.phase === "Settled" && run.result === "Completed",
    log: syntheticLog(run),
    message,
  };
}

export function downloadHref(name: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return "data:text/plain;charset=utf-8," + encodeURIComponent(text);
}

export function receiptFor(view: RunView) {
  return {
    run: view.run.id,
    reference: view.run.reference,
    workload: view.run.spec,
    windowMinutes: view.run.minutes,
    reserveMicros: view.run.reserve,
    meteredSeconds: view.run.seconds,
    computeCostMicros: view.run.base,
    sonnelyFeeMicros: view.run.fee,
    chargedMicros: view.run.charged,
    returnedMicros: view.run.returned,
    result: view.run.result,
    timeline: view.times,
  };
}

export function evidenceFor(view: RunView) {
  return {
    rental: view.run.id,
    image: view.run.spec.tag === "Blackbox" ? view.run.spec.image : undefined,
    composeHash: view.composeHash,
    attestation: view.run.attestation,
    evidenceCapturedAt: view.times.evidenceAt,
    provider: "phala",
    measurementBound: true,
  };
}

const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function Moment({ value }: { value: number }) {
  return <time dateTime={new Date(value).toISOString()}>{date.format(value)}</time>;
}

export function CopyButton({ value, label = "Copy", text = label }: { value: string; label?: string; text?: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
  }
  return (
    <button type="button" className="button quiet small" onClick={() => void copy()} aria-label={status || label}>
      {status === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span>{status || text}</span>
    </button>
  );
}

export function WorkspaceHeading({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="console-title">
      <div className="console-title-identity">
        <span className="console-title-icon">
          <Icon size={21} aria-hidden="true" />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children && <div className="console-title-actions">{children}</div>}
    </header>
  );
}
