import { batchJobSchema, batchLimits, type BatchJob, type BatchRow } from "./batch-inference";

const storeName = "wallets";

function openBatchDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open("sonnely-batch-inference", 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(storeName);
    opening.onerror = () => reject(new Error("Batch storage is unavailable on this device."));
    opening.onsuccess = () => resolve(opening.result);
  });
}

export async function readBatch(wallet: string) {
  const database = await openBatchDatabase();
  try {
    return await new Promise<BatchJob | undefined>((resolve, reject) => {
      const reading = database.transaction(storeName).objectStore(storeName).get(wallet);
      reading.onsuccess = () => {
        if (reading.result === undefined) {
          resolve(undefined);
          return;
        }
        const result = batchJobSchema.safeParse(reading.result);
        if (!result.success) reject(new Error("This device’s saved batch cannot be opened."));
        else resolve(result.data);
      };
      reading.onerror = () => reject(new Error("Could not read this device’s saved batch."));
    });
  } finally {
    database.close();
  }
}

export async function writeBatch(wallet: string, job?: BatchJob) {
  const database = await openBatchDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const writing = database.transaction(storeName, "readwrite");
      if (job) writing.objectStore(storeName).put(job, wallet);
      else writing.objectStore(storeName).delete(wallet);
      writing.oncomplete = () => resolve();
      writing.onabort = writing.onerror = () =>
        reject(new Error("Could not save the batch checkpoint. Check this device’s storage and try again."));
    });
  } finally {
    database.close();
  }
}

export async function withBatchWallet<T>(wallet: string, perform: () => Promise<T>) {
  if (!navigator.locks) throw new Error("Open Batch in a browser that supports local workspace locking.");
  return navigator.locks.request("sonnely-batch:" + wallet, { ifAvailable: true }, async (lock) => {
    if (!lock)
      throw new Error("This wallet’s batch is open in another tab. Pause it there before continuing.");
    return perform();
  });
}

export function waitForBatchSlot(lastSentAt: number | undefined, signal: AbortSignal) {
  const delay = Math.max(0, (lastSentAt ?? 0) + batchLimits.delayMs - Date.now());
  if (!delay || signal.aborted) return;
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, delay);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function resetInFlight(job: BatchJob): BatchJob {
  if (!job.rows.some((row) => row.status === "sending")) return job;
  return {
    ...job,
    rows: job.rows.map((row) =>
      row.status === "sending"
        ? { ...row, status: "interrupted", detail: "The tab closed while this request was in flight." }
        : row,
    ),
  };
}

function serverError(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;
  const { error } = body;
  if (typeof error === "string") return error.slice(0, 240);
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message.slice(0, 240);
  return undefined;
}

export async function sendBatchRow(
  wallet: string,
  jobId: string,
  index: number,
  row: BatchRow,
): Promise<BatchRow> {
  let response: Response;
  try {
    response = await fetch("/api/sonnely/batch/chat", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "batch:" + jobId + ":" + index,
        "X-Sonnely-Batch-Wallet": wallet,
      },
      body: JSON.stringify(row.body),
    });
  } catch {
    return { ...row, status: "interrupted", detail: "The connection ended before a response arrived." };
  }
  const requestId = response.headers.get("X-Sonnely-Request-Id");
  const reference = requestId && /^[a-z0-9]{20,80}$/.test(requestId) ? requestId : undefined;
  const body: unknown = await response.json().catch(() => null);
  const details = { httpStatus: response.status, reference };
  if (
    response.ok &&
    reference &&
    body &&
    typeof body === "object" &&
    "choices" in body &&
    Array.isArray(body.choices)
  )
    return { ...row, ...details, status: "succeeded", output: body };
  if (response.status === 409 && reference) {
    return {
      ...row,
      ...details,
      status: "review",
      detail: "This request already started. Check its settlement in Request logs.",
    };
  }
  if ([401, 402, 403, 429].includes(response.status) && !reference) {
    return {
      ...row,
      ...details,
      status: "blocked",
      detail: serverError(body) ?? "The workspace cannot start this request right now.",
    };
  }
  if ([400, 404, 413, 415, 422].includes(response.status) && !reference) {
    return {
      ...row,
      ...details,
      status: "failed",
      detail: serverError(body) ?? "The gateway rejected this request.",
    };
  }
  return {
    ...row,
    ...details,
    status: reference ? "review" : "interrupted",
    detail: reference
      ? "The gateway returned a request reference. Check its settlement in Request logs."
      : "A complete response did not arrive. Retry this row with its original checkpoint key to check for a prior start.",
  };
}
