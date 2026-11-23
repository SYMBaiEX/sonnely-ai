import { v } from "convex/values";
import { z } from "zod";
import { verifyCvmMeasurement } from "../lib/cvm-measurement";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  blackbox,
  buildArtifact,
  buildStatus,
  commitBlackbox,
  createDock,
  deleteDock,
  dockUsage,
  endpointFor,
  getDock,
  locate,
  prepareBlackbox,
  provider,
  ProviderError,
  startBuild,
  stopDock,
  verifyHardwareQuote,
} from "./computeProvider";

type Run = Doc<"computeRuns"> & { lease: number };

const attestationShape = z.object({
  is_online: z.boolean(),
  tcb_info: z
    .object({
      quote: z.string().nullish(),
      app_compose: z.string().max(170_000),
      event_log: z
        .array(
          z.object({
            imr: z.number(),
            event_type: z.number(),
            event: z.string(),
            event_payload: z.string(),
            digest: z.string(),
          }),
        )
        .max(300),
    })
    .nullish(),
  app_certificates: z.array(z.object({ quote: z.string().nullish() })).nullish(),
});

function advance(
  ctx: ActionCtx,
  row: Run,
  patch: {
    phase?: Run["phase"];
    providerId?: string;
    launchAttemptAt?: number;
    commandAttemptAt?: number;
    commitToken?: string;
    composeHash?: string;
    expiresAt?: number;
    scheduledDelete?: boolean;
    processId?: number;
    startedAt?: number;
    endedAt?: number;
    log?: string;
    endpoint?: string;
    evidence?: Run["evidence"];
    evidenceAt?: number;
    artifact?: Run["artifact"];
    result?: Run["result"];
    message?: string;
    deletionId?: string;
    meteredSeconds?: number;
    meteredBase?: number;
  },
  delay = 0,
  settle = false,
): Promise<boolean> {
  return ctx.runMutation(internal.compute.advance, { id: row._id, lease: row.lease, patch, delay, settle });
}

const isMissing = (error: unknown) => error instanceof ProviderError && [404, 410].includes(error.status);
const rejected = (error: unknown) =>
  error instanceof ProviderError && [400, 401, 402, 403, 404, 413, 422, 429].includes(error.status);
const recoveryGrace = 120_000;

function started(row: Run, providerId: string) {
  const start = row.launchAttemptAt ?? Date.now();
  return { providerId, startedAt: start, expiresAt: start + row.minutes * 60_000 };
}

async function recoverLaunch(ctx: ActionCtx, row: Run) {
  const id = await locate(row);
  if (id) return advance(ctx, row, started(row, id));
  const now = Date.now();
  if (now - row.launchAttemptAt! < recoveryGrace) return advance(ctx, row, {}, 5000);
  return advance(
    ctx,
    row,
    { result: row.stopRequested ? "stopped" : "failed", message: "The provider did not start a rental." },
    0,
    true,
  );
}

async function launch(ctx: ActionCtx, row: Run) {
  if (row.launchAttemptAt) return recoverLaunch(ctx, row);
  if (row.stopRequested || Date.now() > row._creationTime + recoveryGrace)
    return advance(ctx, row, { result: row.stopRequested ? "stopped" : "expired" }, 0, true);

  if (row.kind === "blackboxes" && !row.commitToken) {
    try {
      const prepared = await prepareBlackbox(row);
      return advance(ctx, row, {
        phase: "provisioning",
        composeHash: prepared.compose_hash,
        commitToken: prepared.token,
      });
    } catch (error) {
      if (!rejected(error)) throw error;
      return advance(
        ctx,
        row,
        { result: "failed", message: "Phala declined the CVM configuration." },
        0,
        true,
      );
    }
  }

  // Persist intent before the one request that can start a billable resource. A
  // terminated action is recovered by exact resource name and never re-created.
  const launchAttemptAt = Date.now();
  const began = await ctx.runMutation(internal.compute.markLaunch, {
    id: row._id,
    lease: row.lease,
    at: launchAttemptAt,
  });
  if (!began) return advance(ctx, row, {}, 0);
  const attempt = { ...row, launchAttemptAt };
  try {
    let id: string;
    if (row.kind === "blackboxes") {
      const vm = await commitBlackbox(row);
      const identifier = vm.vm_uuid ?? vm.id;
      if (identifier === undefined) throw new Error("Missing CVM identifier.");
      id = String(identifier);
    } else {
      id = await createDock(row);
    }
    return advance(ctx, row, started(attempt, id));
  } catch (error) {
    // The provider may have accepted a request before the response was lost.
    if (!rejected(error)) throw error;
    return advance(
      ctx,
      row,
      {
        result: "failed",
        message:
          row.kind === "dry-docks"
            ? "Boat declined the start. Check paid capacity."
            : "Phala declined the CVM start.",
      },
      0,
      true,
    );
  }
}

async function blackboxState(ctx: ActionCtx, row: Run) {
  const path = "/cvms/" + encodeURIComponent(row.providerId!);
  if (!row.scheduledDelete) {
    const scheduled = await provider(row.kind, path + "/scheduled-delete", {
      method: "PATCH",
      data: { scheduled_delete_at: new Date(row.expiresAt!).toISOString() },
    });
    await scheduled.body?.cancel();
    return advance(ctx, row, { scheduledDelete: true });
  }

  if (!row.evidence && Date.now() - row.startedAt! >= 240_000)
    return advance(ctx, row, {
      phase: "teardown",
      result: "failed",
      message: "Phala did not return verifiable workload evidence.",
      meteredBase: 0,
      meteredSeconds: 0,
    });
  const vm = await blackbox(row);
  if (["failed", "error", "stopped", "deleted", "exited", "offline"].includes(vm.status.toLowerCase()))
    return advance(ctx, row, {
      phase: "teardown",
      result: "failed",
      message: "The CVM exited before its rental window ended.",
    });
  if (vm.status.toLowerCase() !== "running") return advance(ctx, row, {}, 5000);
  if (row.evidence) return advance(ctx, row, {}, Math.min(15_000, Math.max(0, row.expiresAt! - Date.now())));

  const response = await provider(row.kind, path + "/attestation");
  const declared = Number(response.headers.get("content-length"));
  if (declared > 200_000) {
    await response.body?.cancel();
    throw new Error("Oversized attestation record.");
  }
  const data: unknown = await response.json();
  const parsed = attestationShape.safeParse(data);
  if (!parsed.data?.is_online || !parsed.data.tcb_info) return advance(ctx, row, {}, 5000);
  const evidence = parsed.data;
  const tcb = parsed.data.tcb_info;
  const quote = [tcb.quote, ...(evidence.app_certificates ?? []).map((cert) => cert.quote)].find(
    (quote): quote is string => typeof quote === "string" && /^(?:0x)?[0-9a-f]{200,24000}$/i.test(quote),
  );
  const endpoint = endpointFor(vm);
  if (
    !quote ||
    !endpoint ||
    !row.composeHash ||
    vm.compose_hash !== row.composeHash ||
    !vm.app_id ||
    !vm.instance_id
  )
    return advance(ctx, row, {}, 5000);

  const providerVerification = await verifyHardwareQuote(quote);
  if (
    !providerVerification ||
    !(await verifyCvmMeasurement(
      tcb.app_compose,
      row.composeHash,
      vm.app_id,
      vm.instance_id,
      providerVerification.signedRtmr3,
      tcb.event_log,
    ))
  )
    return advance(ctx, row, {}, 5000);

  const evidenceAt = Date.now();
  const payload = JSON.stringify({
    capturedAt: new Date(evidenceAt).toISOString(),
    expectedComposeHash: row.composeHash,
    providerReportedComposeHash: vm.compose_hash,
    endpoint,
    providerEvidence: data,
    providerVerification,
    composeMeasurementMatched: true,
  });
  if (payload.length > 200_000) throw new Error("Oversized attestation record.");
  const attestation = await ctx.storage.store(new Blob([payload], { type: "application/json" }));
  const saved = await advance(
    ctx,
    row,
    { phase: "running", evidence: attestation, evidenceAt, endpoint },
    5000,
  );
  if (!saved) await ctx.storage.delete(attestation);
  return saved;
}

async function dockState(ctx: ActionCtx, row: Run) {
  const sandbox = (await getDock(row)).sandbox;
  if (["error", "failed", "archived", "stopped", "deleted", "cancelled"].includes(sandbox.state))
    return advance(ctx, row, {
      phase: "teardown",
      result: "failed",
      message: "The build machine went offline.",
    });

  if (!row.processId) {
    if (!["ready", "idle", "running"].includes(sandbox.state)) return advance(ctx, row, {}, 3000);
    if (row.commandAttemptAt)
      return advance(ctx, row, {
        phase: "teardown",
        result: "failed",
        message: "The build did not confirm that it started.",
      });
    const seconds = Math.floor((row.expiresAt! - Date.now()) / 1000) - 20;
    if (seconds < 1) return advance(ctx, row, { phase: "teardown", result: "expired" });
    const marked = await ctx.runMutation(internal.compute.markCommand, { id: row._id, lease: row.lease });
    if (!marked) return advance(ctx, row, {});
    const process = await startBuild(row, seconds);
    return advance(ctx, row, { phase: "running", processId: process.processId }, 2000);
  }

  const status = await buildStatus(row);
  const log = [status.stdout, status.stderr].filter(Boolean).join("\n").slice(-32_000);
  if (status.running) return advance(ctx, row, { log }, 2500);
  if (status.exitCode !== 0)
    return advance(ctx, row, {
      phase: "teardown",
      result: "failed",
      log,
      message:
        status.exitCode === null
          ? "The build process stopped reporting."
          : "Build exited with code " + status.exitCode + ".",
    });

  const blob = await buildArtifact(row).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  const artifact = blob ? await ctx.storage.store(blob) : undefined;
  const saved = await advance(ctx, row, {
    phase: "teardown",
    result: "completed",
    log,
    artifact,
    message: artifact
      ? "Build completed."
      : "Build completed without an output archive under the 5 MiB limit.",
  });
  if (!saved && artifact) await ctx.storage.delete(artifact);
  return saved;
}

async function teardown(ctx: ActionCtx, row: Run) {
  try {
    if (row.kind === "blackboxes") {
      const response = await provider(row.kind, "/cvms/" + encodeURIComponent(row.providerId!), {
        method: "DELETE",
      });
      await response.body?.cancel();
      // A delete can acknowledge before the CVM has disappeared. Only settle
      // after reading the terminal state or an explicit not-found response.
      if (response.status !== 204) {
        const vm = await blackbox(row);
        if (vm.status.toLowerCase() !== "deleted") return advance(ctx, row, {}, 5000);
      }
    } else {
      if (!row.deletionId && row.meteredSeconds === undefined) {
        const usage = await dockUsage(row);
        if (usage.running && Date.now() < row.expiresAt!) {
          await stopDock(row).then(async (response) => {
            await response.body?.cancel();
          });
          return advance(ctx, row, {}, 2500);
        }
        return advance(ctx, row, {
          meteredSeconds: Math.ceil(usage.seconds / usage.billingMultiplier),
          meteredBase: Math.round(usage.dollars * 1_000_000),
        });
      }
      const operation = await deleteDock(row);
      if (operation.status !== "completed")
        return advance(
          ctx,
          row,
          { deletionId: operation.id },
          operation.status === "blocked" ? 30_000 : 3000,
        );
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
    if (row.kind === "dry-docks" && !row.deletionId && row.meteredSeconds === undefined)
      return advance(ctx, row, { meteredSeconds: 0, meteredBase: 0 });
  }
  return advance(
    ctx,
    row,
    {
      result: row.result ?? "expired",
      ...(row.kind === "blackboxes" && !row.evidence ? { meteredBase: 0, meteredSeconds: 0 } : {}),
      ...(row.kind === "dry-docks" && row.meteredSeconds === undefined
        ? { meteredBase: 0, meteredSeconds: 0 }
        : {}),
    },
    0,
    true,
  );
}

export const run = internalAction({
  args: { id: v.id("computeRuns") },
  handler: async (ctx, { id }): Promise<void> => {
    const row = await ctx.runMutation(internal.compute.claim, { id });
    if (!row) return;
    try {
      if (!row.providerId) {
        await launch(ctx, row);
        return;
      }
      if (row.phase === "teardown") {
        await teardown(ctx, row);
        return;
      }
      if (row.stopRequested || Date.now() >= row.expiresAt!) {
        await advance(ctx, row, { phase: "teardown", result: row.stopRequested ? "stopped" : "expired" });
        return;
      }
      if (row.kind === "blackboxes") await blackboxState(ctx, row);
      else await dockState(ctx, row);
    } catch (error) {
      if (row.providerId && row.phase !== "teardown" && isMissing(error)) {
        await advance(ctx, row, {
          phase: "teardown",
          result: "failed",
          message: "The provider removed the machine.",
        });
        return;
      }
      const status = error instanceof ProviderError ? String(error.status) : "transport or response";
      console.warn("Compute provider retry", row._id, row.kind, row.phase, status);
      await advance(ctx, row, {}, row.phase === "teardown" ? 15_000 : 5000);
    }
  },
});
