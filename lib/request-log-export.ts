import { creditDecimal } from "./credit-amount";
import type { RequestLogRow } from "./request-logs";

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function requestLogCsv(rows: readonly RequestLogRow[]) {
  const header = [
    "request_id",
    "time_utc",
    "model",
    "provider",
    "endpoint",
    "key_name",
    "status",
    "input_tokens",
    "output_tokens",
    "cached_tokens",
    "reasoning_tokens",
    "duration_ms",
    "charged_usd",
    "reserved_usd",
    "provider_status",
  ];
  return (
    [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          new Date(row.time).toISOString(),
          row.model,
          row.provider,
          row.endpoint ?? "",
          row.keyName,
          row.status,
          row.input,
          row.output,
          row.cachedTokens ?? "",
          row.reasoningTokens ?? "",
          row.durationMs ?? "",
          row.status === "complete" ? creditDecimal(row.cost) : "",
          row.status === "pending" || row.status === "unreported" ? creditDecimal(row.cost) : "",
          row.providerStatus ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
