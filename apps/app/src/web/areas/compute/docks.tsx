// spec/app/compute/instances.md, "Story: Rent a confidential machine"
import { ArrowUpRight, ChevronDown, Container, Download, Terminal } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { hourlyBaseOf, quoteFor, unitOf } from "../../../../gen/app__compute__instances.ts";
import type { Compute } from "../../../../gen/app__compute__instances.ts";
import { balanceOf } from "../../../../gen/app__billing__ledger.ts";
import type { Ledger } from "../../../../gen/app__billing__ledger.ts";
import { useSession } from "../../session.ts";
import { useRemote } from "../../remote.ts";
import {
  computeFee,
  creditBalance,
  dockDetails,
  dockMinutes,
  downloadHref,
  dryDockPlan,
  isLive,
  observeRuns,
  receiptFor,
  repositoryAllowed,
  revisionPattern,
  runRequest,
  runStatus,
  viewRun,
  WorkspaceHeading,
  type RunObservations,
  type RunView,
} from "./shared.tsx";
import styles from "./docks.module.css";

const exampleDock = {
  repository: "https://github.com/mdn/client-toolchain-example",
  revision: "23fdd12e35684be99fd7273d147997ec60755c62",
};

function dockQuote(minutes: number) {
  const spec = { tag: "DryDock" as const, repository: "repo", revision: "rev" };
  return quoteFor(hourlyBaseOf(spec), unitOf(spec), minutes * 60);
}

function stamp(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function DockTimeline({ view }: { view: RunView }) {
  const steps = [
    ["Queued", view.times.createdAt],
    ["Provisioning", view.times.startedAt],
    ["Building", view.times.workAt],
    ["Teardown", view.times.teardownAt],
    ["Settled", view.times.settledAt],
  ] as const;
  return (
    <ol className={styles.timeline} aria-label="Run timeline">
      {steps
        .filter((entry) => entry[1] !== undefined)
        .map(([label, time]) => (
          <li key={label}>
            <span>{label}</span>
            <time dateTime={new Date(time!).toISOString()}>{new Date(time!).toLocaleTimeString()}</time>
          </li>
        ))}
    </ol>
  );
}

function fileName(view: RunView, kind: string) {
  return "dry-dock-" + kind + "-" + view.run.id + ".txt";
}

export function Docks() {
  const instances = useRemote<Compute>("instances");
  const session = useSession();
  const ledger = useRemote<Ledger>("billing-ledger");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const allRuns = instances.state?.runs ?? [];
  const walletRuns = wallet ? allRuns.filter((run) => run.wallet === wallet) : [];
  const docks = walletRuns.filter((run) => run.kind === "DryDocks").slice(0, 30).reverse();
  const [minutes, setMinutes] = useState<number>(dockMinutes[0]);
  const [repository, setRepository] = useState("");
  const [revision, setRevision] = useState("");
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get("run") ?? "");
  const [followLog, setFollowLog] = useState(true);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const [observations, setObservations] = useState<RunObservations>({});
  const repositoryField = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ input: string; id: string; run: string } | null>(null);

  const nextObservations = observeRuns(docks, observations, Date.now());
  if (nextObservations !== observations) setObservations(nextObservations);

  const views = docks.map((run) => viewRun(run, observations[run.id] ?? {}));
  const selectedView = selected ? views.find((view) => view.run.id === selected) : undefined;
  const view = selectedView ?? (selected ? undefined : views[0]);
  const log = view?.log ?? "";
  const scrollLog = useCallback(
    (node: HTMLPreElement | null) => {
      if (node && followLog) node.scrollTop = node.scrollHeight;
    },
    [followLog, log],
  );
  const loaded = instances.state !== undefined;
  const enabled = loaded;
  const comingSoon = false;
  const quote = dockQuote(minutes);
  const reserved = views.reduce((sum, item) => sum + (item.active ? item.run.reserve : 0), 0);
  const spend = views.reduce((sum, item) => sum + item.run.charged, 0);
  const balance = wallet && ledger.state ? balanceOf(ledger.state, wallet) : 0;
  const activeAny = walletRuns.some(isLive);
  const capacityFull = allRuns.filter((run) => run.kind === "DryDocks" && isLive(run)).length >= 4;
  const disabled = pending || !enabled || balance < quote.total || activeAny || capacityFull;

  function prefillDock(input: { repository: string; revision: string }, time?: number) {
    setRepository(input.repository);
    setRevision(input.revision);
    if (time) setMinutes(time);
    repositoryField.current?.focus();
  }

  function selectRun(runId: string) {
    setSelected(runId);
    setFollowLog(true);
    setCopied(false);
  }

  async function copyRunLink() {
    if (!view) return;
    const url = new URL(window.location.href);
    url.searchParams.set("run", view.run.id);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
    } catch {
      setActionError("Unable to copy the run link.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || pending) return;
    const cleanRepository = repository.trim().replace(/\/$/, "");
    const cleanRevision = revision.trim();
    if (!repositoryAllowed(cleanRepository)) {
      setActionError("Use a public GitHub repository URL and its full 40-character commit SHA.");
      repositoryField.current?.focus();
      return;
    }
    if (!revisionPattern.test(cleanRevision)) {
      setActionError("Use a public GitHub repository URL and its full 40-character commit SHA.");
      return;
    }
    const spec = { tag: "DryDock" as const, repository: cleanRepository, revision: cleanRevision };
    const input = JSON.stringify({ spec, minutes });
    const reference = attempt.current?.input === input ? attempt.current.id : crypto.randomUUID().replaceAll("-", "");
    const id = attempt.current?.input === input ? attempt.current.run : crypto.randomUUID().replaceAll("-", "");
    attempt.current = { input, id: reference, run: id };
    setActionError("");
    setPending(true);
    const failure = await runRequest("/api/compute/runs", { type: "open", id, reference, wallet, spec, minutes });
    setPending(false);
    if (failure === undefined) {
      attempt.current = null;
      selectRun(id);
    } else {
      setActionError(failure);
    }
  }

  async function stop() {
    if (!view || pending) return false;
    setActionError("");
    setPending(true);
    if (!wallet) return false;
    const failure = await runRequest("/api/compute/runs/stop", { id: view.run.id, wallet });
    setPending(false);
    if (failure !== undefined) setActionError(failure);
    return failure === undefined;
  }

  const shownError = actionError || instances.error || "";

  return (
    <div className={"compute-legacy compute-workspace " + styles.workspace}>
      <WorkspaceHeading icon={Container} title={dryDockPlan.title} description="Build a pinned GitHub commit in a clean Linux VM.">
        <a href="/docs/dry-docks" className="button quiet">
          Build guide <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </WorkspaceHeading>

      {comingSoon ? (
        <section className={"panel workspace-feature " + styles.panel} aria-labelledby="dry-docks-status">
          <h2 id="dry-docks-status">Coming soon</h2>
          <p className={styles.meta}>
            Build a pinned GitHub commit, follow the logs, and download the output. Each build runs in a dedicated VM that is deleted
            when the run ends.
          </p>
        </section>
      ) : (
        <div className={styles.grid}>
          <section className={"panel " + styles.panel} aria-labelledby="compute-open">
            <h2 id="compute-open">Configure a build</h2>
            <p className={styles.meta}>
              {dryDockPlan.provider} <span aria-hidden>·</span> {dryDockPlan.size}
            </p>
            {wallet ? (
              <form className={styles.form} onSubmit={(event) => void submit(event)}>
                <label>
                  Public GitHub repository
                  <input
                    ref={repositoryField}
                    name="repository"
                    type="url"
                    required
                    maxLength={180}
                    placeholder="https://github.com/owner/repo"
                    spellCheck={false}
                    value={repository}
                    onChange={(event) => setRepository(event.target.value)}
                  />
                </label>
                <label>
                  Commit SHA
                  <input
                    name="revision"
                    required
                    pattern="[0-9a-fA-F]{40}"
                    maxLength={40}
                    placeholder="Full 40-character SHA"
                    spellCheck={false}
                    value={revision}
                    onChange={(event) => setRevision(event.target.value)}
                  />
                </label>
                <p className={styles.hint}>
                  <code>npm ci</code> installs from a lockfile and <code>npm run build</code> runs in the VM. Downloadable output comes
                  from <code>dist</code>, <code>build</code>, <code>out</code>, or <code>.next</code>, up to 5 MiB.
                </p>
                <button className="button quiet" type="button" onClick={() => prefillDock(exampleDock)}>
                  Use MDN example repository
                </button>
                <label>
                  Build time limit
                  <span className={styles.select}>
                    <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                      {dockMinutes.map((value) => (
                        <option key={value} value={value}>
                          {value} minutes
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden />
                  </span>
                </label>
                {balance < quote.total && enabled && (
                  <p className={styles.notice}>
                    <a href="/console/billing">Add credits</a> to cover the maximum.
                  </p>
                )}
                {activeAny && <p className={styles.notice}>Your wallet can run one compute job at a time.</p>}
                {capacityFull && <p className={styles.notice}>The pilot capacity limit was reached. Try again shortly.</p>}
                <button className="button primary" type="submit" disabled={disabled}>
                  {pending ? "Working…" : "Start paid build · up to " + creditBalance(quote.total)}
                </button>
              </form>
            ) : (
              <p className={styles.notice}>Connect a Solana wallet to start and manage paid runs.</p>
            )}
          </section>

          <aside className={"panel " + styles.panel} aria-labelledby="compute-price">
            <h2 id="compute-price">Pricing</h2>
            <p className={styles.meta}>{creditBalance(dryDockPlan.hourlyBase)}/hr compute rate.</p>
            <dl className={styles.pricing}>
              <div>
                <dt>Compute cost at {minutes} min</dt>
                <dd>{creditBalance(quote.base)}</dd>
              </div>
              <div>
                <dt>Sonnely fee</dt>
                <dd>{creditBalance(quote.fee)}</dd>
              </div>
              <div>
                <dt>Maximum held</dt>
                <dd>{creditBalance(quote.total)}</dd>
              </div>
            </dl>
            <p className={styles.hint}>
              The estimate combines compute cost, service fees, and a {creditBalance(computeFee)} charge for each billed run. Unspent
              credits return to your balance after teardown.
            </p>
            <p className={styles.hint}>
              Boat meters machine time by the second. The sandbox is deleted when the build ends or the limit is reached.
            </p>
            <a href="/console/billing" className={styles.link}>
              Manage credits <ArrowUpRight size={15} aria-hidden />
            </a>
          </aside>
        </div>
      )}

      {shownError && (
        <p className={styles.notice} role="alert">
          {shownError}
        </p>
      )}

      {wallet && (!comingSoon || views.length > 0 || selected) && (
        <section className={"panel " + styles.panel} aria-labelledby="compute-runs">
          <div className={styles.runHeader}>
            <div>
              <h2 id="compute-runs">Build usage</h2>
              <p className={styles.meta}>Your last 30 builds</p>
            </div>
            <div className={styles.totals}>
              <span>
                <b>{creditBalance(reserved)}</b> held
              </span>
              <span>
                <b>{creditBalance(spend)}</b> charged
              </span>
            </div>
          </div>
          {!view && (!selected || !loaded) ? (
            <p className={styles.notice}>{loaded ? "No runs yet." : "Loading compute usage…"}</p>
          ) : !view && !views.length ? (
            <p className={styles.notice}>This run is unavailable in this wallet.</p>
          ) : (
            <div className={styles.runGrid}>
              <div className={styles.runList} aria-label="Recent builds">
                {views.map((item) => (
                  <button key={item.run.id} type="button" aria-pressed={view?.run.id === item.run.id} onClick={() => selectRun(item.run.id)}>
                    <strong>{dockDetails(item.run)}</strong>
                    <span>
                      {runStatus(item.run)} <span aria-hidden>·</span>{" "}
                      {item.times.createdAt !== undefined ? stamp(item.times.createdAt) : "time unavailable"}
                    </span>
                  </button>
                ))}
              </div>
              {!view ? (
                <p className={styles.notice}>This run is unavailable in this wallet.</p>
              ) : (
                <div className={styles.runDetail}>
                  <div className={styles.runHeader}>
                    <h3>{dockDetails(view.run)}</h3>
                    <span className={styles.state}>{runStatus(view.run)}</span>
                  </div>
                  <p className={styles.meta}>
                    {view.active
                      ? creditBalance(view.run.reserve) +
                        " held" +
                        (view.expiresAt ? " · ends " + new Date(view.expiresAt).toLocaleTimeString() : "")
                      : creditBalance(view.run.charged) + " charged · " + view.run.seconds + " s metered"}
                  </p>
                  {!view.active && (
                    <p className={styles.hint}>
                      Compute cost {creditBalance(view.run.base)} · Sonnely fee {creditBalance(view.run.fee)}
                    </p>
                  )}
                  <DockTimeline view={view} />
                  {view.message && <p className={styles.hint}>{view.message}</p>}
                  <div className={styles.actions}>
                    <button className="button quiet" type="button" onClick={() => void copyRunLink()}>
                      {copied ? "Link copied" : "Copy run link"}
                    </button>
                    {!view.active && (
                      <>
                        <a className="button secondary" href={downloadHref(fileName(view, "receipt"), receiptFor(view))} download={fileName(view, "receipt")}>
                          Download receipt
                        </a>
                        {!comingSoon && view.run.spec.tag === "DryDock" && (
                          <button
                            className="button quiet"
                            type="button"
                            onClick={() => {
                              if (view.run.spec.tag === "DryDock") prefillDock(view.run.spec, view.run.minutes);
                            }}
                          >
                            Use this commit again
                          </button>
                        )}
                      </>
                    )}
                    {view.hasArtifact && (
                      <a
                        className="button secondary"
                        href={downloadHref(fileName(view, "artifact"), "Dry Dock artifact placeholder for " + view.run.id + "\n" + view.log)}
                        download={fileName(view, "artifact")}
                      >
                        <Download size={16} /> Download artifact
                      </a>
                    )}
                    {view.active && view.run.phase !== "Teardown" && (
                      <button className="button secondary" type="button" disabled={pending || view.run.stopRequested} onClick={() => void stop()}>
                        {view.run.stopRequested ? "Stop requested" : "Cancel build"}
                      </button>
                    )}
                  </div>
                  <div className={styles.log}>
                    <div>
                      <Terminal size={16} aria-hidden /> <b>{view.active ? "Live build log" : "Build log"}</b>
                      {view.hasLog && (
                        <a href={downloadHref(fileName(view, "log"), view.log)} download={fileName(view, "log")}>
                          Download log
                        </a>
                      )}
                      <button type="button" aria-pressed={followLog} onClick={() => setFollowLog(!followLog)}>
                        Follow
                      </button>
                    </div>
                    <pre tabIndex={0} ref={scrollLog} aria-label="Build output">
                      {log || (view.active ? "Waiting for build output…" : "No log available.")}
                    </pre>
                  </div>
                  {view.purgeAt && <p className={styles.hint}>Logs and artifacts expire {new Date(view.purgeAt).toLocaleDateString()}.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
