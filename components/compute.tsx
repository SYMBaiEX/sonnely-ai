"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Container, Download, Terminal } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { creditBalance } from "@/lib/credit-amount";
import { computeFee, computeMarkup, computePlans, computeQuote, type ComputeKind } from "@/lib/compute";
import { request, type Session } from "./wallet";
import { Blackboxes } from "./blackboxes";
import styles from "./compute.module.css";

export type ComputeSnapshot = FunctionReturnType<typeof api.compute.list>;
export type ComputeRun = ComputeSnapshot["runs"][number];

const exampleDock = {
  repository: "https://github.com/mdn/client-toolchain-example",
  revision: "23fdd12e35684be99fd7273d147997ec60755c62",
};

function status(run: ComputeRun) {
  if (run.phase === "settled") return run.result ?? "finished";
  if (run.phase === "teardown" || run.stopRequested) return "tearing down";
  return run.phase;
}

function details(run: ComputeRun) {
  return run.spec.kind === "dry-docks"
    ? run.spec.repository.replace("https://github.com/", "") + " · " + run.spec.revision.slice(0, 8)
    : run.spec.image;
}

export function Compute({
  kind,
  session,
  initialRun,
  refreshBalance,
}: {
  kind: ComputeKind;
  session?: Session | null;
  initialRun?: string;
  refreshBalance?: () => Promise<void>;
}) {
  const plan = computePlans[kind];
  const blackbox = kind === "blackboxes";
  const wallet = session?.profile?.wallet;
  const balance = session?.profile?.balance ?? 0;
  const [minutes, setMinutes] = useState<number>(plan.minutes[0]);
  const [snapshot, setSnapshot] = useState<ComputeSnapshot>();
  const [reload, setReload] = useState(0);
  const [loadedTarget, setLoadedTarget] = useState<string>();
  const comingSoon = snapshot?.enabled !== true;
  const [selected, setSelected] = useState(initialRun ?? "");
  const [followLog, setFollowLog] = useState(true);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const actionInFlight = useRef(false);
  const attempt = useRef<{ input: string; id: string }>(null);
  const logView = useRef<HTMLPreElement>(null);
  const formView = useRef<HTMLFormElement>(null);
  const runs = snapshot?.runs ?? [];
  const run =
    runs.find((item) => item.id === selected) ??
    (snapshot?.detail?.id === selected ? snapshot.detail : undefined) ??
    (selected ? undefined : (blackbox && runs.find((item) => item.active)) || runs[0]);
  const log = snapshot?.selected === run?.id ? snapshot?.log : undefined;
  const id = run?.id ?? "";
  const target = selected || id;
  const params = "compute?kind=" + kind + (target ? "&id=" + encodeURIComponent(target) : "");

  useEffect(() => {
    if (logView.current && followLog) logView.current.scrollTop = logView.current.scrollHeight;
  }, [log, followLog]);

  function prefillDock(input: { repository: string; revision: string }, time?: number) {
    const repository = formView.current?.elements.namedItem("repository");
    const revision = formView.current?.elements.namedItem("revision");
    if (!(repository instanceof HTMLInputElement) || !(revision instanceof HTMLInputElement)) return;
    repository.value = input.repository;
    revision.value = input.revision;
    if (time) setMinutes(time);
    repository.focus();
  }

  function selectRun(runId: string) {
    setSelected(runId);
    setFollowLog(true);
    setCopied(false);
  }

  async function copyRunLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("run", id);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
    } catch {
      setActionError("Unable to copy the run link.");
    }
  }

  useEffect(() => {
    if (!wallet) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 10_000;
      try {
        const next = await request<ComputeSnapshot>(params);
        if (!current) return;
        setSnapshot(next);
        setLoadedTarget(target);
        setLoadError("");
        if (next.detail?.active || next.runs.some((item) => item.active)) delay = 2500;
      } catch (error) {
        if (!current) return;
        setLoadError(error instanceof Error ? error.message : "Compute usage is unavailable.");
      }
      if (current) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [wallet, params, target, reload]);

  async function submit(event: FormEvent<HTMLFormElement>, windowMinutes = minutes) {
    event.preventDefault();
    if (actionInFlight.current) return false;
    const data = new FormData(event.currentTarget);
    const spec = blackbox
      ? {
          kind,
          image: String(data.get("image") ?? "").trim(),
          port: Number(data.get("port")),
          machine: String(data.get("machine")),
          disk: Number(data.get("disk")),
        }
      : {
          kind,
          repository: String(data.get("repository") ?? "")
            .trim()
            .replace(/\/$/, ""),
          revision: String(data.get("revision") ?? "").trim(),
        };
    const input = JSON.stringify({ spec, minutes: windowMinutes });
    const reference =
      attempt.current?.input === input ? attempt.current.id : crypto.randomUUID().replaceAll("-", "");
    attempt.current = { input, id: reference };
    actionInFlight.current = true;
    setActionError("");
    setPending(true);
    try {
      const response = await request<{ id: string }>("compute", {
        action: "open",
        spec,
        minutes: windowMinutes,
        reference,
      });
      attempt.current = null;
      selectRun(response.id);
      setReload((value) => value + 1);
      void refreshBalance?.();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to start this run.");
      return false;
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }

  async function stop() {
    if (!run || actionInFlight.current) return false;
    actionInFlight.current = true;
    setActionError("");
    setPending(true);
    try {
      await request("compute", { action: "stop", id: run.id });
      setSnapshot((current) => {
        if (!current) return current;
        const markStopped = (item: ComputeRun) =>
          item.id === run.id && item.active ? { ...item, stopRequested: true } : item;
        return {
          ...current,
          detail: current.detail && markStopped(current.detail),
          runs: current.runs.map(markStopped),
        };
      });
      setReload((value) => value + 1);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to end this run.");
      return false;
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }

  if (blackbox) {
    return (
      <Blackboxes
        session={session}
        snapshot={snapshot}
        run={run}
        runs={runs}
        pending={pending}
        loadError={loadError}
        actionError={actionError}
        onSelect={selectRun}
        onOpen={submit}
        onStop={stop}
        onRefresh={() => setReload((value) => value + 1)}
        onClearError={() => setActionError("")}
        selectionPending={Boolean(selected && !run && loadedTarget !== target)}
        selectionUnavailable={Boolean(selected && !run && loadedTarget === target)}
      />
    );
  }

  const quote = computeQuote(kind, minutes);
  const reserved = runs.reduce((sum, item) => sum + (item.active ? item.reserve : 0), 0);
  const spend = runs.reduce((sum, item) => sum + (item.charged ?? 0), 0);
  const visibleRuns = run && !runs.some((item) => item.id === run.id) ? [run, ...runs] : runs;
  const disabled =
    pending ||
    !snapshot?.enabled ||
    session?.termsRequired ||
    balance < quote.total ||
    runs.some((item) => item.active);
  const fileUrl = "/api/sonnely/compute?id=" + encodeURIComponent(id) + "&file=";

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <span className={styles.emblem}>
          <Container size={25} aria-hidden />
        </span>
        <div>
          <h1>{plan.title}</h1>
          <p>
            {comingSoon
              ? "On-demand repository builds in isolated Linux VMs."
              : "Build a pinned GitHub commit in a clean Linux VM. Watch the logs and retrieve the output after automatic teardown."}
          </p>
        </div>
      </header>

      {comingSoon ? (
        <section className={"panel " + styles.panel} aria-labelledby="dry-docks-status">
          <h2 id="dry-docks-status">Coming soon</h2>
          <p className={styles.meta}>
            Build a pinned GitHub commit, follow the logs, and download the output. Each build runs in a
            dedicated VM that is deleted when the run ends.
          </p>
        </section>
      ) : (
        <div className={styles.grid}>
          <section className={"panel " + styles.panel} aria-labelledby="compute-open">
            <h2 id="compute-open">Configure a build</h2>
            <p className={styles.meta}>
              {plan.provider} <span aria-hidden>·</span> {plan.size}
            </p>
            {wallet ? (
              <form className={styles.form} onSubmit={(event) => void submit(event)} ref={formView}>
                <label>
                  Public GitHub repository
                  <input
                    name="repository"
                    type="url"
                    required
                    maxLength={180}
                    placeholder="https://github.com/owner/repo"
                    spellCheck={false}
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
                  />
                </label>
                <p className={styles.hint}>
                  <code>npm ci</code> installs from a lockfile and <code>npm run build</code> runs in the VM.
                  Downloadable output comes from <code>dist</code>, <code>build</code>, <code>out</code>, or{" "}
                  <code>.next</code>, up to 5 MiB.
                </p>
                <button className="button quiet" type="button" onClick={() => prefillDock(exampleDock)}>
                  Use MDN example repository
                </button>
                <label>
                  Build time limit
                  <span className={styles.select}>
                    <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                      {plan.minutes.map((value) => (
                        <option key={value} value={value}>
                          {value} minutes
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden />
                  </span>
                </label>
                {balance < quote.total && snapshot?.enabled && (
                  <p className={styles.notice}>
                    <Link href="/console/billing">Add credits</Link> to cover the maximum.
                  </p>
                )}
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
            <p className={styles.meta}>{creditBalance(plan.hourlyBase)}/hr provider rate.</p>
            <dl className={styles.pricing}>
              <div>
                <dt>Provider cost at {minutes} min</dt>
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
              The fee is {computeMarkup}% of the compute cost plus {creditBalance(computeFee)} for a billed
              run. Unspent credits return to your balance after teardown.
            </p>
            <p className={styles.hint}>
              Boat meters machine time by the second. The sandbox is deleted when the build ends or the limit
              is reached.
            </p>
            <Link href="/console/billing" className={styles.link}>
              Manage credits <ArrowUpRight size={15} aria-hidden />
            </Link>
          </aside>
        </div>
      )}

      {(loadError || actionError) && (
        <p className={styles.notice} role="alert">
          {actionError || loadError}
        </p>
      )}

      {wallet && (!comingSoon || visibleRuns.length > 0 || selected) && (
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
          {!run && (!selected || !snapshot) ? (
            <p className={styles.notice}>{snapshot ? "No runs yet." : "Loading compute usage…"}</p>
          ) : !run && !runs.length ? (
            <p className={styles.notice}>This run is unavailable in this wallet.</p>
          ) : (
            <div className={styles.runGrid}>
              <div className={styles.runList} aria-label="Recent builds">
                {visibleRuns.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={id === item.id}
                    onClick={() => selectRun(item.id)}
                  >
                    <strong>{details(item)}</strong>
                    <span>
                      {status(item)} <span aria-hidden>·</span>{" "}
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                        item.createdAt,
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {!run ? (
                <p className={styles.notice}>This run is unavailable in this wallet.</p>
              ) : (
                <div className={styles.runDetail}>
                  <div className={styles.runHeader}>
                    <h3>{details(run)}</h3>
                    <span className={styles.state}>{status(run)}</span>
                  </div>
                  <p className={styles.meta}>
                    {run.active
                      ? creditBalance(run.reserve) +
                        " held" +
                        (run.expiresAt ? " · ends " + new Date(run.expiresAt).toLocaleTimeString() : "")
                      : creditBalance(run.charged ?? 0) + " charged · " + (run.seconds ?? 0) + " s metered"}
                  </p>
                  {!run.active && (
                    <p className={styles.hint}>
                      Provider cost {creditBalance(run.base ?? 0)} · Sonnely fee {creditBalance(run.fee ?? 0)}
                    </p>
                  )}
                  <DockTimeline run={run} />
                  {run.message && <p className={styles.hint}>{run.message}</p>}
                  <div className={styles.actions}>
                    <button className="button quiet" type="button" onClick={() => void copyRunLink()}>
                      {copied ? "Link copied" : "Copy run link"}
                    </button>
                    {!run.active && (
                      <>
                        <a className="button secondary" href={fileUrl + "receipt"}>
                          Download receipt
                        </a>
                        {!comingSoon && run.spec.kind === "dry-docks" && (
                          <button
                            className="button quiet"
                            type="button"
                            onClick={() => {
                              if (run.spec.kind === "dry-docks") prefillDock(run.spec, run.minutes);
                            }}
                          >
                            Use this commit again
                          </button>
                        )}
                      </>
                    )}
                    {run.hasArtifact && (
                      <a className="button secondary" href={fileUrl + "artifact"}>
                        <Download size={16} /> Download artifact
                      </a>
                    )}
                    {run.active && run.phase !== "teardown" && (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={pending || run.stopRequested}
                        onClick={() => void stop()}
                      >
                        {run.stopRequested ? "Stop requested" : "Cancel build"}
                      </button>
                    )}
                  </div>
                  <div className={styles.log}>
                    <div>
                      <Terminal size={16} aria-hidden /> <b>{run.active ? "Live build log" : "Build log"}</b>
                      {run.hasLog && (
                        <a href={fileUrl + "log"} download>
                          Download log
                        </a>
                      )}
                      <button type="button" aria-pressed={followLog} onClick={() => setFollowLog(!followLog)}>
                        Follow
                      </button>
                    </div>
                    <pre tabIndex={0} ref={logView} aria-label="Build output">
                      {log || (run.active ? "Waiting for build output…" : "No log available.")}
                    </pre>
                  </div>
                  {run.purgeAt && (
                    <p className={styles.hint}>
                      Logs and artifacts expire {new Date(run.purgeAt).toLocaleDateString()}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DockTimeline({ run }: { run: ComputeRun }) {
  const steps = [
    ["Queued", run.createdAt],
    ["Provisioning", run.startedAt],
    ["Building", run.workAt],
    ["Teardown", run.teardownAt],
    ["Settled", run.settledAt],
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
