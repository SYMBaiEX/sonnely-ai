import { creditDecimal } from "./credit-amount";

type UsageSample = {
  id: string;
  time: number;
  model: string;
  provider: string;
  keyName: string;
  keyId?: string;
  status: string;
  input: number;
  output: number;
  cost: number;
  cached?: number;
  providerMs?: number;
};

export const usageStates = {
  complete: "Completed",
  failed: "Failed",
  pending: "Reserved",
  unreported: "Under review",
} as const;

export const noUsageFilters = { provider: "", model: "", key: "", status: "" };

export function usageKey(row: UsageSample) {
  return row.keyId ? "key:" + row.keyId : "label:" + row.keyName;
}

export function filterUsage<T extends UsageSample>(rows: T[], filters: typeof noUsageFilters) {
  return rows.filter(
    (row) =>
      (!filters.provider || row.provider === filters.provider) &&
      (!filters.model || row.model === filters.model) &&
      (!filters.key || usageKey(row) === filters.key) &&
      (!filters.status || row.status === filters.status),
  );
}

export function summarizeUsage(rows: readonly UsageSample[]) {
  const totals = {
    requests: rows.length,
    complete: 0,
    failed: 0,
    input: 0,
    output: 0,
    spend: 0,
    held: 0,
    cached: 0,
    cacheSamples: 0,
  };
  for (const row of rows) {
    totals.input += row.input;
    totals.output += row.output;
    if (row.status === "complete") {
      totals.complete++;
      totals.spend += row.cost;
    }
    if (row.status === "failed") totals.failed++;
    if (row.status === "pending" || row.status === "unreported") totals.held += row.cost;
    if (row.cached !== undefined) {
      totals.cached += row.cached;
      totals.cacheSamples++;
    }
  }
  return totals;
}

export function providerP95(rows: readonly UsageSample[]) {
  const durations = rows
    .flatMap(({ providerMs }) => (providerMs === undefined ? [] : [providerMs]))
    .sort((left, right) => left - right);
  return { samples: durations.length, value: durations[Math.ceil(durations.length * 0.95) - 1] };
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe =
    typeof value === "string" && /^(?:[\s\u0000-\u001f]*[=+@＝＋－＠-]|[\t\r\n])/.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

export function usageCsv(rows: readonly UsageSample[]) {
  return (
    [
      "time_utc,request_id,provider,model,key_name,key_id,status,input_tokens,cached_input_tokens,output_tokens,charged_usd,held_usd,provider_duration_ms",
      ...rows.map((row) =>
        [
          new Date(row.time).toISOString(),
          row.id,
          row.provider,
          row.model,
          row.keyName,
          row.keyId ?? "",
          row.status,
          row.input,
          row.cached ?? "",
          row.output,
          row.status === "complete" ? creditDecimal(row.cost) : "0",
          row.status === "pending" || row.status === "unreported" ? creditDecimal(row.cost) : "0",
          row.providerMs ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
