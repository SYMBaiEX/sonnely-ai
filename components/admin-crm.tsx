"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { request } from "./wallet";
import { BulkFlagBar, CustomerFilters, CustomersTable } from "./admin/customers";
import { CustomerWorkspace } from "./admin/customer";
import {
  ticketStates,
  traceStates,
  useCrm,
  type CrmPage,
  type CrmView,
  type Customer,
  type Segment,
  type Ticket,
  type Trace,
} from "./admin/shared";
import { TicketList } from "./admin/support";
import { TraceList } from "./admin/traces";

export { useCrm };
export type { CrmView };

export function AdminCrm({ view, canOpenCustomer = true }: { view: CrmView; canOpenCustomer?: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [flag, setFlag] = useState("");
  const [funded, setFunded] = useState("any");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState<Customer["id"][]>([]);
  const [bulkFlag, setBulkFlag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [segmentError, setSegmentError] = useState("");
  const [trail, setTrail] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [revision, setRevision] = useState(0);
  const cursor = trail.at(-1);
  const params = new URLSearchParams({ view, filter, search, ...(cursor ? { cursor } : {}) });
  if (view === "customers") {
    if (flag) params.set("flag", flag);
    if (funded !== "any") params.set("funded", funded);
    if (activeOnly) params.set("active", "true");
  }
  const state = useCrm<CrmPage>("admin-crm?" + params, revision);
  const segments = useCrm<Segment[]>(view === "customers" ? "admin-crm?view=segments" : "", revision);
  const flagOptions = useCrm<string[]>(view === "customers" ? "admin-crm?view=flags" : "", revision);
  const refresh = () => setRevision((value) => value + 1);
  function applySegment(segment: Segment) {
    try {
      const saved = JSON.parse(segment.definition) as {
        search?: string;
        flag?: string;
        funded?: string;
        active?: boolean;
      };
      setSearch(typeof saved.search === "string" ? saved.search : "");
      setFlag(typeof saved.flag === "string" ? saved.flag : "");
      setFunded(saved.funded === "funded" || saved.funded === "unfunded" ? saved.funded : "any");
      setActiveOnly(Boolean(saved.active));
      setTrail([]);
      setSegmentId(segment.id);
      setSegmentError("");
    } catch {
      setSegmentError("That saved view could not be read.");
    }
  }

  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("view-name") ?? "").trim();
    if (!name) return;
    setSegmentError("");
    try {
      const saved = await request<Segment>("admin-segment-save", {
        name,
        definition: JSON.stringify({ search, flag, funded, active: activeOnly }),
      });
      form.reset();
      setSegmentId(saved.id);
      refresh();
    } catch (error) {
      setSegmentError(error instanceof Error ? error.message : "Could not save the view.");
    }
  }

  async function deleteView() {
    if (!segmentId) return;
    setSegmentError("");
    try {
      await request("admin-segment-delete", { id: segmentId });
      setSegmentId("");
      refresh();
    } catch (error) {
      setSegmentError(error instanceof Error ? error.message : "Could not delete the view.");
    }
  }

  async function flagSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = bulkFlag.trim();
    if (!value || !selected.length) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      for (const accountId of selected) await request("admin-flag", { account: accountId, flag: value });
      setSelected([]);
      setBulkFlag("");
      refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Could not flag the selected accounts.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (account) return <CustomerWorkspace id={account} back={() => setAccount("")} open={setAccount} />;

  const description = {
    customers: "Find a wallet and review its account, referrals, payments, requests, and support history.",
    support: "Review support requests, assign ownership, and update their status.",
    traces: "Inspect request metadata, provider outcomes, and settlement amounts.",
  };
  const title = { customers: "Customers", support: "Support inbox", traces: "Request traces" };
  return (
    <section className="panel stack-panel" aria-labelledby="crm-heading">
      <div className="between">
        <div>
          <h2 id="crm-heading">{title[view]}</h2>
          <p className="caption">{description[view]}</p>
        </div>
        <button type="button" className="button quiet small" onClick={refresh}>
          Refresh {view}
        </button>
      </div>
      <div className="crm-controls">
        {view !== "support" && (
          <form
            className="crm-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
              setTrail([]);
            }}
          >
            <input
              name="search"
              type="search"
              maxLength={80}
              aria-label={view === "customers" ? "Search customers" : "Search request traces"}
              placeholder={
                view === "customers" ? "@username or wallet address" : "Sonnely or provider request ID"
              }
            />
            <button className="button quiet">
              <Search size={16} /> Search
            </button>
          </form>
        )}
        {view !== "customers" && (
          <select
            aria-label={view === "support" ? "Support status" : "Trace status"}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setTrail([]);
            }}
          >
            <option value="all">All statuses</option>
            {Object.entries(view === "support" ? ticketStates : traceStates).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        {view === "customers" && (
          <CustomerFilters
            flag={flag}
            setFlag={setFlag}
            funded={funded}
            setFunded={setFunded}
            activeOnly={activeOnly}
            setActiveOnly={setActiveOnly}
            segmentId={segmentId}
            setSegmentId={setSegmentId}
            segments={segments}
            flagOptions={flagOptions}
            applySegment={applySegment}
            deleteView={deleteView}
            saveView={saveView}
            segmentError={segmentError}
            setTrail={setTrail}
          />
        )}
      </div>
      {view === "customers" && selected.length > 0 && (
        <BulkFlagBar
          selected={selected}
          setSelected={setSelected}
          bulkFlag={bulkFlag}
          setBulkFlag={setBulkFlag}
          flagOptions={flagOptions}
          bulkBusy={bulkBusy}
          bulkError={bulkError}
          flagSelected={flagSelected}
        />
      )}
      {state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !state?.data ? (
        <p role="status">Loading {title[view].toLowerCase()}…</p>
      ) : (
        <>
          {view === "customers" && (
            <CustomersTable
              rows={state.data.page as Customer[]}
              selected={selected}
              setSelected={setSelected}
              open={setAccount}
            />
          )}
          {view === "support" && (
            <TicketList
              rows={state.data.page as Ticket[]}
              open={canOpenCustomer ? setAccount : undefined}
              refresh={refresh}
            />
          )}
          {view === "traces" && <TraceList rows={state.data.page as Trace[]} open={setAccount} />}
          {(trail.length > 0 || !state.data.isDone) && (
            <div className="actions">
              <button
                type="button"
                className="button quiet small"
                disabled={!trail.length}
                onClick={() => setTrail(trail.slice(0, -1))}
              >
                Previous page
              </button>
              <button
                type="button"
                className="button quiet small"
                disabled={state.data.isDone}
                onClick={() => {
                  if (state.data) setTrail([...trail, state.data.continueCursor]);
                }}
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
