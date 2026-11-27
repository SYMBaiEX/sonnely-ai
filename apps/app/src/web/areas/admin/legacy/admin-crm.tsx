// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { request } from "./wallet";
import { SearchField } from "../../../search.tsx";
import {
  BulkFlagBar,
  CustomerFilters,
  CustomersTable,
  ExportCustomers,
  SegmentChips,
  type CustomerSort,
} from "./admin/customers.tsx";
import { CustomerWorkspace } from "./admin/customer.tsx";
import { useCrm, type CrmPage, type CrmView, type Customer, type Segment } from "./admin/shared.tsx";
import { SupportInbox } from "./admin/support.tsx";
import { TracesPanel } from "./admin/traces.tsx";
import { Skeleton } from "./admin/ui.tsx";

export { useCrm };
export type { CrmView };

export function AdminCrm({ view, canOpenCustomer = true }: { view: CrmView; canOpenCustomer?: boolean }) {
  const [search, setSearch] = useState("");
  const [flag, setFlag] = useState("");
  const [funded, setFunded] = useState("any");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sort, setSort] = useState<CustomerSort>("recent");
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
  const params = new URLSearchParams({ view, search, ...(cursor ? { cursor } : {}) });
  if (view === "customers") {
    if (flag) params.set("flag", flag);
    if (funded !== "any") params.set("funded", funded);
    if (activeOnly) params.set("active", "true");
    if (sort !== "recent") params.set("sort", sort);
  }
  const state = useCrm<CrmPage>(view === "customers" ? "admin-crm?" + params : "", revision);
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
  if (view === "support") return <SupportInbox open={canOpenCustomer ? setAccount : undefined} />;

  const title = { customers: "Customers", support: "Support inbox", traces: "Request traces" };
  return (
    <section className="panel stack-panel" aria-labelledby="crm-heading">
      <div className="between">
        <div>
          <h2 id="crm-heading">{title[view]}</h2>
        </div>
        {view === "customers" && (
          <button type="button" className="button quiet small" onClick={refresh}>
            Refresh {view}
          </button>
        )}
      </div>
      {view === "customers" && (
        <div className="crm-controls">
          <form
            className="crm-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(String(new FormData(event.currentTarget).get("search") ?? "").trim());
              setTrail([]);
            }}
          >
            <SearchField
              name="search"
              maxLength={80}
              aria-label="Search customers"
              placeholder="@username or wallet address"
            />
            <button className="button quiet">
              <Search size={16} /> Search
            </button>
          </form>
          <CustomerFilters
            flag={flag}
            setFlag={setFlag}
            funded={funded}
            setFunded={setFunded}
            activeOnly={activeOnly}
            setActiveOnly={setActiveOnly}
            sort={sort}
            setSort={setSort}
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
          <ExportCustomers rows={(state?.data?.page ?? []) as Customer[]} />
        </div>
      )}
      {view === "customers" && (
        <SegmentChips
          segments={segments}
          segmentId={segmentId}
          setSegmentId={setSegmentId}
          applySegment={applySegment}
        />
      )}
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
      {view === "traces" ? (
        <TracesPanel open={setAccount} />
      ) : state?.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : !state?.data ? (
        <Skeleton rows={6} />
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
