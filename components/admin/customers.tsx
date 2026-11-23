"use client";

import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { creditBalance } from "@/lib/credit-amount";
import { Identity, localTime, type Customer, type Segment } from "./shared";

export function CustomerFilters({
  flag,
  setFlag,
  funded,
  setFunded,
  activeOnly,
  setActiveOnly,
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
  return rows.length ? (
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
            <th>Account</th>
            <th>Joined</th>
            <th>Balance</th>
            <th>Role</th>
            <th>Workspace</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
                <Identity customer={row} />
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
              <td>{localTime(row.joined)}</td>
              <td>{creditBalance(row.balance)}</td>
              <td>{row.role}</td>
              <td>
                <button
                  type="button"
                  className="button quiet small"
                  onClick={() => open(row.id)}
                >
                  View account <ArrowRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="caption">No matching customers.</p>
  );
}
