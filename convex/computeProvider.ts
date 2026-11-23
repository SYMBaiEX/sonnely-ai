import { z } from "zod";
import { artifactLimit } from "../lib/compute";
import { defaultBlackboxDisk, defaultBlackboxMachine } from "../lib/blackbox-options";
import type { Doc } from "./_generated/dataModel";

type Run = Doc<"computeRuns">;
const phalaCvm = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  vm_uuid: z.string().nullish(),
  app_id: z.string().nullish(),
  instance_id: z.string().nullish(),
  status: z.string(),
  name: z.string(),
  public_urls: z.array(z.object({ app: z.string() })).nullish(),
  endpoints: z.array(z.object({ app: z.string() })).nullish(),
  compose_hash: z.string().nullish(),
  app_url: z.string().nullish(),
});
const boatSandbox = z.object({
  id: z.string().regex(/^bx_[a-z0-9]+$/),
  state: z.string(),
  name: z.string().optional(),
});

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super("Compute provider request failed.");
  }
}

export async function provider(
  kind: Run["kind"],
  path: string,
  options: {
    method?: string;
    data?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const isBoat = kind === "dry-docks";
  const key = isBoat ? process.env.BOAT_API_KEY : process.env.PHALA_CLOUD_API_KEY;
  if (!key) throw new Error("Compute provider credentials are unavailable.");
  const base = isBoat ? "https://boat.dev/api/v1" : "https://cloud-api.phala.com/api/v1";
  const response = await fetch(base + path, {
    method: options.method,
    body: options.data === undefined ? undefined : JSON.stringify(options.data),
    headers: {
      ...(isBoat ? { Authorization: "Bearer " + key } : { "X-API-Key": key, "X-API-Version": "2026-01-21" }),
      "Content-Type": "application/json",
      "User-Agent": "SonnelyCompute/1.0",
      ...options.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const error = z
      .object({ code: z.string().optional() })
      .safeParse(await response.json().catch(() => null));
    throw new ProviderError(response.status, error.data?.code);
  }
  return response;
}

const call = async (
  kind: Run["kind"],
  path: string,
  options?: Parameters<typeof provider>[2],
): Promise<unknown> => (await provider(kind, path, options)).json();

export function resourceName(row: Run) {
  return "sonnely-" + row._id.toLowerCase();
}

export async function locate(row: Run) {
  const name = resourceName(row);
  if (row.kind === "blackboxes") {
    const rows = z
      .union([z.array(z.unknown()), z.object({ items: z.array(z.unknown()) })])
      .parse(await call(row.kind, "/cvms"));
    const candidate = (Array.isArray(rows) ? rows : rows.items)
      .map((item) => phalaCvm.safeParse(item))
      .find((item) => item.data?.name === name)?.data;
    const id = candidate?.vm_uuid ?? candidate?.id;
    return id === undefined ? undefined : String(id);
  }
  const response = z
    .object({ sandboxes: z.array(boatSandbox) })
    .parse(await call(row.kind, "/sandboxes?name=" + name));
  return response.sandboxes.find((sandbox) => sandbox.name === name)?.id;
}

export async function prepareBlackbox(row: Run) {
  if (row.spec.kind !== "blackboxes") throw new Error("Invalid Blackbox configuration.");
  const compose = [
    "services:",
    "  workload:",
    "    image: " + JSON.stringify(row.spec.image),
    '    ports: ["80:' + row.spec.port + '"]',
  ].join("\n");
  return z.object({ token: z.string().min(1), compose_hash: z.string().min(1) }).parse(
    await call(row.kind, "/cvms", {
      method: "POST",
      data: {
        name: resourceName(row),
        instance_type: row.spec.machine ?? defaultBlackboxMachine,
        disk_size: row.spec.disk ?? defaultBlackboxDisk,
        listed: false,
        compose_file: {
          name: resourceName(row),
          docker_compose_file: compose,
          allowed_envs: [],
          gateway_enabled: true,
          kms_enabled: true,
          public_logs: false,
          public_sysinfo: false,
          public_tcbinfo: true,
        },
      },
    }),
  );
}

export async function commitBlackbox(row: Run) {
  return phalaCvm.parse(
    await call(row.kind, "/cvms", {
      method: "POST",
      data: { token: row.commitToken },
    }),
  );
}

export async function blackbox(row: Run) {
  return phalaCvm.parse(await call(row.kind, "/cvms/" + encodeURIComponent(row.providerId!)));
}

export function endpointFor(cvm: Awaited<ReturnType<typeof blackbox>>) {
  for (const candidate of [cvm.public_urls?.[0]?.app, cvm.endpoints?.[0]?.app, cvm.app_url]) {
    if (!candidate) continue;
    const url = URL.parse(candidate);
    if (url?.protocol === "https:" && !url.username && !url.password) return url.href;
  }
}

export async function boatCapacity() {
  const limits = z
    .object({
      canStart: z.boolean(),
      checkoutRequired: z.boolean(),
      hasPaymentHistory: z.boolean(),
      subscriptionStatus: z.string().nullish(),
      nextStartDollars: z.number().nonnegative(),
      activeSandboxes: z.number().nonnegative().optional(),
      maxActiveSandboxes: z.number().nonnegative().optional(),
      machineTypes: z.array(z.object({ type: z.string(), available: z.boolean() })),
    })
    .parse(await call("dry-docks", "/limits"));
  const paid = limits.hasPaymentHistory && limits.subscriptionStatus === "active";
  const state = limits.checkoutRequired
    ? "checkout"
    : !paid
      ? "unpaid"
      : limits.nextStartDollars > 0
        ? "overage"
        : limits.canStart && limits.machineTypes.some((item) => item.type === "small" && item.available)
          ? "ready"
          : "capacity";
  return { state, active: limits.activeSandboxes ?? null, limit: limits.maxActiveSandboxes ?? null };
}

export async function createDock(row: Run) {
  const { state } = await boatCapacity();
  if (state !== "ready") throw new ProviderError(402, "boat_capacity");
  const response = z.object({ sandbox: boatSandbox }).parse(
    await call(row.kind, "/sandboxes", {
      method: "POST",
      data: {
        name: resourceName(row),
        type: "small",
        noEnv: true,
        snapshots: false,
        ttlSeconds: row.minutes * 60,
      },
      headers: { "Idempotency-Key": row._id },
    }),
  );
  return response.sandbox.id;
}

export async function getDock(row: Run) {
  return z.object({ sandbox: boatSandbox }).parse(await call(row.kind, "/sandboxes/" + row.providerId));
}

export function buildCommand(repository: string, revision: string, seconds: number) {
  const task = [
    "set -eu",
    "umask 077",
    "work=$(mktemp -d /tmp/sonnely-build.XXXXXXXX)",
    'cd "$work"',
    "export CI=1 GIT_TERMINAL_PROMPT=0",
    'printf "%s\\n" "Fetching pinned commit"',
    "git init -q",
    "git fetch --depth=1 " + repository + " " + revision,
    "git checkout --detach FETCH_HEAD",
    'test "$(git rev-parse HEAD)" = ' + revision.toLowerCase(),
    'printf "%s\\n" "Installing dependencies with npm ci"',
    "npm ci --no-audit --no-fund",
    'printf "%s\\n" "Running npm build"',
    "npm run build",
    "for output in dist build out .next; do",
    '  if [ -d "$output" ] && [ ! -L "$output" ]; then',
    '    tar --exclude=".next/cache" --exclude=".next/standalone" -czf /tmp/sonnely-build.tar.gz -- "$output"',
    "    break",
    "  fi",
    "done",
  ].join("\n");
  return "timeout --kill-after=5s " + seconds + "s bash -c '" + task + "' 2>&1";
}

export async function startBuild(row: Run, seconds: number) {
  if (row.spec.kind !== "dry-docks") throw new Error("Invalid Dry Dock configuration.");
  return z.object({ processId: z.number().int().positive() }).parse(
    await call(row.kind, "/sandboxes/" + row.providerId + "/commands", {
      method: "POST",
      data: {
        command: buildCommand(row.spec.repository, row.spec.revision.toLowerCase(), seconds),
        detached: true,
      },
    }),
  );
}

export async function buildStatus(row: Run) {
  return z
    .object({ running: z.boolean(), exitCode: z.number().nullable(), stdout: z.string(), stderr: z.string() })
    .parse(
      await call(
        row.kind,
        "/sandboxes/" + row.providerId + "/commands/" + row.processId + "?tailBytes=16000",
      ),
    );
}

export async function buildArtifact(row: Run) {
  const response = await provider(
    row.kind,
    "/sandboxes/" + row.providerId + "/artifacts?path=%2Ftmp%2Fsonnely-build.tar.gz",
  );
  const reader = response.body?.getReader();
  if (!reader) return null;
  const parts: ArrayBuffer[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > artifactLimit) {
      await reader.cancel();
      return null;
    }
    parts.push(Uint8Array.from(chunk.value).buffer);
  }
  return size ? new Blob(parts, { type: "application/gzip" }) : null;
}

export async function deleteDock(row: Run) {
  const id = row.providerId;
  const deletion = z.object({ operation: z.object({ id: z.string(), status: z.string() }) });
  if (row.deletionId) {
    return deletion.parse(await call(row.kind, "/deletion-operations/" + encodeURIComponent(row.deletionId)))
      .operation;
  }
  return deletion.parse(
    await call(row.kind, "/sandboxes/" + id, {
      method: "DELETE",
      headers: { "X-Ascii-Confirm-Delete": id! },
    }),
  ).operation;
}

export const stopDock = (row: Run) =>
  provider(row.kind, "/sandboxes/" + row.providerId + "/stop", {
    method: "POST",
  });

export async function dockUsage(row: Run) {
  return z
    .object({
      running: z.boolean(),
      dollars: z.number().nonnegative(),
      seconds: z.number().nonnegative(),
      billingMultiplier: z.number().positive(),
    })
    .parse(
      await call(
        row.kind,
        "/sandboxes/" +
          row.providerId +
          "/usage?since=" +
          encodeURIComponent(new Date(row._creationTime).toISOString()),
      ),
    );
}

export async function verifyHardwareQuote(hex: string) {
  const response = await fetch("https://cloud-api.phala.com/api/v1/attestations/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "SonnelyCompute/1.0" },
    body: JSON.stringify({ hex }),
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const result = z
    .object({
      success: z.boolean(),
      proof_of_cloud: z.boolean(),
      checksum: z.string().nullish(),
      quote: z.object({ verified: z.boolean(), body: z.object({ rtmr3: z.string() }) }).nullish(),
    })
    .parse(await response.json());
  return result.success && result.proof_of_cloud && result.quote?.verified
    ? { verified: true, proofOfCloud: true, checksum: result.checksum, signedRtmr3: result.quote.body.rtmr3 }
    : null;
}
