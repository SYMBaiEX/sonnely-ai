// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import type { FormEvent } from "react";
import { ChevronRight, Download } from "lucide-react";
import { creditBalance, creditDecimal } from "../lib/credit-amount.ts";
import { CopyButton } from "../shared.tsx";
import { EmptyState, Pill } from "./ui.tsx";
import { Identity, type Customer, type Segment } from "./shared.tsx";

export type CustomerSort = "recent" | "spend" | "balance";

const avatarTones = [
  "crm-cell-avatar-0",
  "crm-cell-avatar-1",
  "crm-cell-avatar-2",
  "crm-cell-avatar-3",
  "crm-cell-avatar-4",
];

function avatarTone(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarTones[hash % avatarTones.length];
}

function initials(customer: Pick<Customer, "name" | "username" | "wallet">) {
  const source = (customer.name || customer.username || customer.wallet).trim();
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : source.slice(0, 2)).toUpperCase();
}

export function CustomerFilters({
  flag,
  setFlag,
  funded,
  setFunded,
  activeOnly,
  setActiveOnly,
  sort,
  setSort,
  segmentId,
  setSegmentId,
  segments,
  flagOptions,
  applySegment,
  deleteView,
  saveView,
  segmentError,
  setTrail,
}: {
  flag: string;
  setFlag: (flag: string) => void;
  funded: string;
  setFunded: (funded: string) => void;
  activeOnly: boolean;
  setActiveOnly: (active: boolean) => void;
  sort: CustomerSort;
  setSort: (sort: CustomerSort) => void;
  segmentId: string;
  setSegmentId: (id: string) => void;
  segments: { data?: Segment[] } | undefined;
  flagOptions: { data?: string[] } | undefined;
  applySegment: (segment: Segment) => void;
  deleteView: () => Promise<void>;
  saveView: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  segmentError: string;
  setTrail: (trail: string[]) => void;
}) {
  return (
    <>
      <select
        aria-label="Flag filter"
        value={flag}
        onChange={(event) => {
          setFlag(event.target.value);
          setTrail([]);
        }}
      >
        <option value="">Any flag</option>
        {(flagOptions?.data ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {flag && !(flagOptions?.data ?? []).includes(flag) && <option value={flag}>{flag}</option>}
      </select>
      <select
        aria-label="Funding filter"
        value={funded}
        onChange={(event) => {
          setFunded(event.target.value);
          setTrail([]);
        }}
      >
        <option value="any">Any funding</option>
        <option value="funded">Funded</option>
        <option value="unfunded">Unfunded</option>
      </select>
      <label className="crm-check">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(event) => {
            setActiveOnly(event.target.checked);
            setTrail([]);
          }}
        />
        Active 30d
      </label>
      <select
        aria-label="Sort customers"
        value={sort}
        onChange={(event) => {
          setSort(event.target.value as CustomerSort);
          setTrail([]);
        }}
      >
        <option value="recent">Newest</option>
        <option value="spend">Top spenders</option>
        <option value="balance">Highest balance</option>
      </select>
      <select
        aria-label="Saved views"
        value={segmentId}
        onChange={(event) => {
          const segment = segments?.data?.find((item) => item.id === event.target.value);
          if (segment) applySegment(segment);
          else setSegmentId("");
        }}
      >
        <option value="">Saved views…</option>
        {(segments?.data ?? []).map((segment) => (
          <option key={segment.id} value={segment.id}>
            {segment.name}
          </option>
        ))}
      </select>
      {segmentId && (
        <button type="button" className="button quiet small" onClick={() => void deleteView()}>
          Delete view
        </button>
      )}
      <form className="crm-search" onSubmit={(event) => void saveView(event)}>
        <input
          name="view-name"
          type="text"
          maxLength={40}
          required
          placeholder="Name this view"
          aria-label="Name this view"
        />
        <button className="button quiet small">Save view</button>
      </form>
      {segmentError && (
        <p role="alert" className="error">
          {segmentError}
        </p>
      )}
    </>
  );
}

export function SegmentChips({
  segments,
  segmentId,
  setSegmentId,
  applySegment,
}: {
  segments: { data?: Segment[] } | undefined;
  segmentId: string;
  setSegmentId: (id: string) => void;
  applySegment: (segment: Segment) => void;
}) {
  const items = segments?.data ?? [];
  if (!items.length) return null;
  return (
    <div className="crm-segments" role="group" aria-label="Saved views">
      {items.map((segment) => {
        const selected = segment.id === segmentId;
        return (
          <button
            key={segment.id}
            type="button"
            className={"crm-chip" + (selected ? " active" : "")}
            aria-pressed={selected}
            onClick={() => (selected ? setSegmentId("") : applySegment(segment))}
          >
            {segment.name}
          </button>
        );
      })}
    </div>
  );
}

export function BulkFlagBar({
  selected,
  setSelected,
  bulkFlag,
  setBulkFlag,
  flagOptions,
  bulkBusy,
  bulkError,
  flagSelected,
}: {
  selected: Customer["id"][];
  setSelected: (ids: Customer["id"][]) => void;
  bulkFlag: string;
  setBulkFlag: (flag: string) => void;
  flagOptions: { data?: string[] } | undefined;
  bulkBusy: boolean;
  bulkError: string;
  flagSelected: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <form className="crm-controls" onSubmit={(event) => void flagSelected(event)}>
      <span className="pill">{selected.length} selected</span>
      <input
        type="text"
        list="crm-flag-list"
        value={bulkFlag}
        onChange={(event) => setBulkFlag(event.target.value)}
        maxLength={24}
        required
        placeholder="flag-name"
        aria-label="Flag to apply"
      />
      <datalist id="crm-flag-list">
        {(flagOptions?.data ?? []).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <button className="button quiet small" disabled={bulkBusy}>
        {bulkBusy ? "Flagging…" : "Flag selected"}
      </button>
      <button type="button" className="button quiet small" onClick={() => setSelected([])}>
        Clear
      </button>
      {bulkError && (
        <p role="alert" className="error">
          {bulkError}
        </p>
      )}
    </form>
  );
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

function exportCsv(rows: Customer[]) {
  const lines = rows.map((row) =>
    [
      row.wallet,
      row.username ?? "",
      row.flags.join("|"),
      creditDecimal(row.balance),
      new Date(row.joined).toISOString(),
      String(row.funded),
      String(row.active),
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(
    ["wallet,username,flags,balance,joined,funded,active\n" + lines.join("\n") + "\n"],
    { type: "text/csv" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sonnely-customers-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportCustomers({ rows }: { rows: Customer[] }) {
  return (
    <button
      type="button"
      className="button quiet small"
      onClick={() => rows.length && exportCsv(rows)}
      disabled={!rows.length}
      title="Export this page as CSV"
    >
      <Download size={14} /> Export CSV
    </button>
  );
}

export function CustomersTable({
  rows,
  selected,
  setSelected,
  open,
}: {
  rows: Customer[];
  selected: Customer["id"][];
  setSelected: (ids: Customer["id"][]) => void;
  open: (id: string) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        title="No customers match"
        hint="Clear the search, flag, or funding filters to widen the list."
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all customers on this page"
                checked={rows.every((row) => selected.includes(row.id))}
                onChange={(event) => {
                  const ids = rows.map((row) => row.id);
                  setSelected(
                    event.target.checked
                      ? [...new Set([...selected, ...ids])]
                      : selected.filter((id) => !ids.includes(id)),
                  );
                }}
              />
            </th>
            <th>Customer</th>
            <th>Status</th>
            <th>Joined</th>
            <th className="num">Balance</th>
            <th>Role</th>
            <th aria-label="Row actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const seed = row.name || row.username || row.wallet;
            return (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label="Select customer"
                    checked={selected.includes(row.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, row.id]
                          : selected.filter((id) => id !== row.id),
                      )
                    }
                  />
                </td>
                <th scope="row">
                  <span className="crm-customer">
                    <span className={"crm-cell-avatar " + avatarTone(seed)} aria-hidden="true">
                      {initials(row)}
                    </span>
                    <Identity customer={row} />
                  </span>
                  {row.flags.length > 0 && (
                    <span className="crm-flags">
                      {row.flags.map((flag) => (
                        <span key={flag} className="pill">
                          {flag}
                        </span>
                      ))}
                    </span>
                  )}
                </th>
                <td>
                  <span className="crm-status">
                    <Pill tone={row.funded ? "ok" : "muted"}>{row.funded ? "Funded" : "Unfunded"}</Pill>
                    <Pill tone={row.active ? "ok" : "muted"}>{row.active ? "Active" : "Inactive"}</Pill>
                  </span>
                </td>
                <td>{new Date(row.joined).toLocaleDateString()}</td>
                <td className="num">{creditBalance(row.balance)}</td>
                <td>{row.role}</td>
                <td>
                  <span className="crm-row-actions">
                    <CopyButton value={row.wallet} label="Copy wallet" />
                    <button
                      type="button"
                      className="button quiet small"
                      onClick={() => open(row.id)}
                    >
                      View <ChevronRight size={14} />
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
