// spec/app/compute/instances.md, "Story: Rent a confidential machine"
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Box,
  Braces,
  CircleCheck,
  Clock3,
  Cpu,
  Download,
  FileCode2,
  Globe2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  Terminal,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { hourlyBaseOf, quoteFor, unitOf } from "../../../../gen/app__compute__instances.ts";
import type { Compute } from "../../../../gen/app__compute__instances.ts";
import { balanceOf } from "../../../../gen/app__billing__ledger.ts";
import type { Ledger } from "../../../../gen/app__billing__ledger.ts";
import type { Session } from "../../../../gen/app__session.ts";
import { useRemote } from "../../remote.ts";
import {
  blackboxAgentPresets,
  blackboxDiskHourlyRate,
  blackboxDiskSizes,
  blackboxHourlyBase,
  blackboxMachineIds,
  blackboxMachines,
  blackboxMinutes,
  blackboxName,
  blackboxPresets,
  blackboxSize,
  blackboxStatus,
  computeFee,
  computeMarkup,
  CopyButton,
  creditBalance,
  defaultBlackboxDisk,
  defaultBlackboxMachine,
  downloadHref,
  evidenceFor,
  imagePattern,
  isBlackboxDisk,
  isBlackboxMachine,
  isLive,
  Moment,
  observeRuns,
  receiptFor,
  viewRun,
  WorkspaceHeading,
  type BlackboxAgentPreset,
  type BlackboxDisk,
  type BlackboxMachine,
  type BlackboxPreset,
  type RunObservations,
  type RunView,
} from "./shared.tsx";
import styles from "./blackboxes.module.css";

const presetIds = Object.keys(blackboxPresets) as BlackboxPreset[];
const agentPresetIds = Object.keys(blackboxAgentPresets) as BlackboxAgentPreset[];
type Workload = BlackboxPreset | BlackboxAgentPreset | "custom";
type Filter = "All rentals" | "Active" | "Past";
const filters: Filter[] = ["All rentals", "Active", "Past"];
const presetIcons = { nginx: Globe2, httpbin: Braces, whoami: Network } as const;

function isAgentPreset(preset: Workload): preset is BlackboxAgentPreset {
  return Object.hasOwn(blackboxAgentPresets, preset);
}

function WorkloadOption({
  option,
  icon: Icon,
  selected,
  onSelect,
}: {
  option: { title: string; description: string };
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={styles.choice}>
      <input type="radio" name="preset" checked={selected} onChange={onSelect} />
      <span className={styles.presetCard}>
        <Icon size={18} aria-hidden="true" />
        <span>
          <strong>{option.title}</strong>
          <small>{option.description}</small>
        </span>
      </span>
    </label>
  );
}

function Status({ view }: { view: RunView }) {
  return (
    <span className={styles.status} data-running={blackboxStatus(view.run) === "Running" || undefined}>
      <span aria-hidden="true" />
      {blackboxStatus(view.run)}
    </span>
  );
}

function Remaining({ view }: { view: RunView }) {
  const rental = view.run;
  if (!view.active || rental.stopRequested || rental.phase === "Teardown") return null;
  if (view.expiresAt === undefined)
    return <p className={styles.muted}>The rental timer starts when provisioning begins.</p>;
  const now = Date.now();
  const total = rental.minutes * 60;
  const remaining = Math.min(total, Math.max(0, Math.ceil((view.expiresAt - now) / 1000)));
  const clock = Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0");
  return (
    <div className={styles.countdown}>
      <div className={styles.between}>
        <span>
          <Clock3 size={15} aria-hidden="true" /> <strong>{clock}</strong> remaining
        </span>
        <span>
          Ends <Moment value={view.expiresAt} />
        </span>
      </div>
      <progress aria-label="Rental time used" value={total - remaining} max={total} />
    </div>
  );
}

function timelineIndex(view: RunView) {
  const phase = view.run.stopRequested && view.active ? "Teardown" : view.run.phase;
  return ["Queued", "Provisioning", "Running", "Teardown", "Settled"].indexOf(phase);
}

function Timeline({ view }: { view: RunView }) {
  const current = timelineIndex(view);
  const milestones = [
    { label: "Queued", time: view.times.createdAt },
    { label: "Provisioning", time: view.times.startedAt },
    { label: "Attested", time: view.times.evidenceAt },
    { label: "Teardown", time: view.times.teardownAt },
    { label: "Settled", time: view.times.settledAt },
  ];
  return (
    <ol className={styles.timeline} aria-label="Rental lifecycle">
      {milestones.map(({ label, time }, index) => (
        <li key={label} aria-current={index === current ? "step" : undefined} data-done={time !== undefined || undefined}>
          <span className={styles.milestone} aria-hidden="true">
            {time !== undefined && <CircleCheck size={14} />}
          </span>
          <span>
            <strong>{label}</strong>
            {time !== undefined && <Moment value={time} />}
          </span>
        </li>
      ))}
    </ol>
  );
}

function quoteForBlackbox(machine: BlackboxMachine, disk: BlackboxDisk, minutes: number) {
  const spec = { tag: "Blackbox" as const, image: "img", port: 8080, machine, disk };
  return quoteFor(hourlyBaseOf(spec), unitOf(spec), minutes * 60);
}

function downloadName(view: RunView, kind: string) {
  return kind + "-" + view.run.id + ".txt";
}

export function Consoles() {
  const instances = useRemote<Compute>("instances");
  const session = useRemote<Session>("session");
  const ledger = useRemote<Ledger>("billing-ledger");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const owner = Boolean(wallet);
  const allRuns = instances.state?.runs ?? [];
  const walletRuns = wallet ? allRuns.filter((run) => run.wallet === wallet) : [];
  const rentals = walletRuns.filter((run) => run.kind === "Blackboxes").slice().reverse();
  const [filter, setFilter] = useState<Filter>("All rentals");
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<Workload>("nginx");
  const [machine, setMachine] = useState<BlackboxMachine>(defaultBlackboxMachine);
  const [disk, setDisk] = useState<BlackboxDisk>(defaultBlackboxDisk);
  const [minutes, setMinutes] = useState<number>(blackboxMinutes[0]);
  const [image, setImage] = useState("");
  const [port, setPort] = useState("8080");
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get("run") ?? "");
  const [observations, setObservations] = useState<RunObservations>({});
  const composer = useRef<HTMLDialogElement>(null);
  const quotePanel = useRef<HTMLElement>(null);
  const confirmEnd = useRef<HTMLDialogElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{ input: string; id: string; run: string } | null>(null);

  const nextObservations = observeRuns(rentals, observations, Date.now());
  if (nextObservations !== observations) setObservations(nextObservations);

  const views = rentals.map((run) => viewRun(run, observations[run.id] ?? {}));
  const active = views.find((view) => view.active);
  const selectedView = selected ? views.find((view) => view.run.id === selected) : undefined;
  const rental = selectedView ?? (selected ? undefined : (active ?? views[0]));
  const loaded = instances.state !== undefined;
  const available = loaded;
  const selectionPending = Boolean(selected && !rental && !loaded);
  const selectionUnavailable = Boolean(selected && !rental && loaded);
  const balance = wallet && ledger.state ? balanceOf(ledger.state, wallet) : 0;
  const agentPreset = isAgentPreset(preset) ? blackboxAgentPresets[preset] : undefined;
  const selectedPreset = preset === "custom" || isAgentPreset(preset) ? undefined : blackboxPresets[preset];
  const hourlyRate = blackboxHourlyBase(machine, disk);
  const quote = quoteForBlackbox(machine, disk, minutes);
  const held = views.reduce((sum, view) => sum + (view.active ? view.run.reserve : 0), 0);
  const charged = views.reduce((sum, view) => sum + view.run.charged, 0);
  const activeAny = walletRuns.some(isLive);
  const blackboxCapacity = allRuns.filter((run) => run.kind === "Blackboxes" && isLive(run)).length;
  const capacityFull = blackboxCapacity >= 2;
  const matched = views.filter(
    (view) =>
      (filter === "All rentals" || view.active === (filter === "Active")) &&
      ((view.run.spec.tag === "Blackbox" ? view.run.spec.image : "") + " " + view.run.id + " " + (view.run.spec.tag === "Blackbox" ? view.run.spec.port : ""))
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const endpoint = rental?.endpoint;
  const evidenceFile = rental ? downloadHref(downloadName(rental, "attestation"), evidenceFor(rental)) : undefined;
  const receiptFile = rental ? downloadHref(downloadName(rental, "receipt"), receiptFor(rental)) : undefined;
  const access = !owner ? "Connect wallet" : loaded ? (available ? "Rentals available" : "Rentals unavailable") : "Checking availability";
  const newRentalBlocked = !available || activeAny || capacityFull;

  function inspect(id: string) {
    setSelected(id);
    setActionError("");
  }

  function selectWorkload(next: Workload, resetSizing = false) {
    const agent = isAgentPreset(next) ? blackboxAgentPresets[next] : undefined;
    setPreset(next);
    setImage("");
    setPort(String(agent?.port ?? 8080));
    if (resetSizing || Boolean(agent) !== Boolean(agentPreset)) {
      setMachine(agent ? "tdx.medium" : defaultBlackboxMachine);
      setDisk(agent ? 40 : defaultBlackboxDisk);
    }
    setFormError("");
  }

  function configure(from?: RunView, initialPreset: Workload = "nginx") {
    setActionError("");
    setFormError("");
    const savedPreset =
      from?.run.spec.tag === "Blackbox"
        ? presetIds.find((id) => {
            const option = blackboxPresets[id];
            return from.run.spec.tag === "Blackbox" && from.run.spec.image === option.image && from.run.spec.port === option.port;
          })
        : undefined;
    selectWorkload(from ? (savedPreset ?? "custom") : initialPreset, true);
    if (from?.run.spec.tag === "Blackbox") {
      setImage(from.run.spec.image);
      setPort(String(from.run.spec.port));
      setMachine(isBlackboxMachine(from.run.spec.machine) ? from.run.spec.machine : defaultBlackboxMachine);
      setDisk(isBlackboxDisk(from.run.spec.disk) ? from.run.spec.disk : defaultBlackboxDisk);
    }
    setMinutes(from?.run.minutes ?? blackboxMinutes[0]);
    composer.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || pending) return;
    const trimmed = image.trim();
    if (!selectedPreset && !imagePattern.test(trimmed)) {
      setFormError("Enter a Docker Hub or GHCR image pinned with @sha256: followed by its 64-character digest.");
      const field = event.currentTarget.elements.namedItem("image");
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }
    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setFormError("Enter a container HTTP port from 1 to 65535.");
      return;
    }
    const spec = {
      tag: "Blackbox" as const,
      image: selectedPreset?.image ?? trimmed,
      port: selectedPreset?.port ?? portNumber,
      machine,
      disk,
    };
    const input = JSON.stringify({ spec, minutes });
    const reference = attempt.current?.input === input ? attempt.current.id : crypto.randomUUID().replaceAll("-", "");
    const id = attempt.current?.input === input ? attempt.current.run : crypto.randomUUID().replaceAll("-", "");
    attempt.current = { input, id: reference, run: id };
    setActionError("");
    setPending(true);
    const ok = await instances.send({ type: "open", id, reference, wallet, spec, minutes });
    setPending(false);
    if (ok) {
      attempt.current = null;
      setSelected(id);
      composer.current?.close();
    } else {
      setActionError(instances.error ?? "Unable to start this rental.");
    }
  }

  async function refreshRuns() {
    try {
      const response = await fetch("/api/machines/instances", { cache: "no-store" });
      if (!response.ok) setActionError(`Rental status could not refresh (HTTP ${response.status}).`);
    } catch {
      setActionError("Rental status could not refresh.");
    }
  }

  async function stopRental() {
    if (!rental || pending) return false;
    setActionError("");
    setPending(true);
    const ok = await instances.send({ type: "stop", id: rental.run.id });
    setPending(false);
    if (!ok) setActionError(instances.error ?? "Unable to end this rental.");
    return ok;
  }

  const shownError = actionError || instances.error || "";

  return (
    <div className={"compute-legacy compute-workspace " + styles.workspace}>
      <WorkspaceHeading
        icon={Box}
        title="Blackboxes"
        description="Start from a container preset or bring your own image to a confidential VM."
      >
        <a className="button quiet" href="/docs/blackboxes">
          Rental guide <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <button className="button accent" type="button" onClick={() => configure()}>
          <Plus size={18} aria-hidden="true" /> {owner ? "New rental" : "View rental options"}
        </button>
      </WorkspaceHeading>
      <dl className={"panel " + styles.facts}>
        <div>
          <dt>
            <Cpu size={16} aria-hidden="true" /> Resources
          </dt>
          <dd>1–4 vCPU · 2–8 GB RAM</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={16} aria-hidden="true" /> Rental window
          </dt>
          <dd>15 min to 2 hr</dd>
        </div>
        <div>
          <dt>
            <Wallet size={16} aria-hidden="true" /> Starting hold
          </dt>
          <dd>{creditBalance(quoteForBlackbox(defaultBlackboxMachine, defaultBlackboxDisk, 15).total)}</dd>
        </div>
        <div>
          <dt>
            <ShieldCheck size={16} aria-hidden="true" /> Availability
          </dt>
          <dd>{access}</dd>
        </div>
      </dl>

      {instances.error && (
        <div className={styles.notice} role="alert">
          <span>Rental status could not refresh. {instances.error}</span>
          <button type="button" className="button quiet small" onClick={() => void refreshRuns()}>
            Try again
          </button>
        </div>
      )}

      {rental ? (
        <section className={styles.panel} aria-labelledby="rental-name" key={rental.run.id}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.kicker}>{rental.active ? "Active rental" : "Rental details"}</p>
              <h2 id="rental-name" ref={detailHeading} tabIndex={-1} autoFocus={Boolean(selected)}>
                {blackboxName(rental.run)}
              </h2>
            </div>
            <Status view={rental} />
          </div>
          <div className={styles.controls}>
            {endpoint && (
              <>
                <a className="button accent" href={endpoint} target="_blank" rel="noreferrer">
                  Open workload <ArrowUpRight size={15} aria-hidden="true" />
                </a>
                <CopyButton key={rental.run.id + "-endpoint"} value={endpoint} label="Copy endpoint" />
              </>
            )}
            {rental.hasEvidence && evidenceFile && (
              <a className="button quiet" href={evidenceFile} download={downloadName(rental, "attestation")}>
                <Download size={16} aria-hidden="true" /> Download attestation
              </a>
            )}
            {!rental.active && receiptFile && (
              <a className="button quiet" href={receiptFile} download={downloadName(rental, "receipt")}>
                <Download size={16} aria-hidden="true" /> Download receipt
              </a>
            )}
            {!rental.active && (
              <button className="button quiet" type="button" onClick={() => configure(rental)}>
                <Plus size={16} aria-hidden="true" /> Rent this image again
              </button>
            )}
            {rental.active && !rental.run.stopRequested && rental.run.phase !== "Teardown" && (
              <button
                className={"button quiet " + styles.end}
                type="button"
                disabled={pending}
                onClick={() => {
                  setActionError("");
                  confirmEnd.current?.showModal();
                }}
              >
                <Square size={14} aria-hidden="true" /> End rental
              </button>
            )}
            {active && rental.run.id !== active.run.id && (
              <button className="button quiet" type="button" onClick={() => inspect(active.run.id)}>
                View active rental <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <Remaining key={rental.run.id} view={rental} />
          {rental.message && <p className={styles.notice}>{rental.message}</p>}
          <Timeline view={rental} />
          <div className={styles.detailGrid}>
            <section aria-label="Workload and evidence" key={rental.run.id}>
              <h3>
                <ShieldCheck size={17} aria-hidden="true" /> Workload and evidence
              </h3>
              <dl className={styles.details}>
                <div>
                  <dt>Machine and disk</dt>
                  <dd>{rental.run.spec.tag === "Blackbox" ? blackboxSize(rental.run.spec.machine, rental.run.spec.disk) : "—"}</dd>
                </div>
                <div>
                  <dt>Container port</dt>
                  <dd>{rental.run.spec.tag === "Blackbox" ? rental.run.spec.port : "—"}</dd>
                </div>
                <div>
                  <dt>Rental window</dt>
                  <dd>{rental.run.minutes} min</dd>
                </div>
                <div>
                  <dt>Attestation</dt>
                  <dd>
                    {rental.hasEvidence
                      ? "Evidence available"
                      : rental.active
                        ? "Awaiting evidence"
                        : rental.times.evidenceAt
                          ? "Evidence expired"
                          : "No evidence available"}
                  </dd>
                </div>
                {rental.hasEvidence && rental.purgeAt !== undefined && (
                  <div>
                    <dt>Evidence expires</dt>
                    <dd>
                      <Moment value={rental.purgeAt} />
                    </dd>
                  </div>
                )}
                {rental.times.evidenceAt !== undefined && (
                  <div>
                    <dt>Evidence captured</dt>
                    <dd>
                      <Moment value={rental.times.evidenceAt} />
                    </dd>
                  </div>
                )}
              </dl>
              <p className={styles.hint}>
                {endpoint
                  ? "This HTTPS endpoint is public. Verify the attestation and protect the workload with your own authentication."
                  : rental.active
                    ? "The public HTTPS endpoint becomes available after verification."
                    : "The VM and disk were removed during teardown."}
              </p>
              <details className={styles.technical}>
                <summary>
                  <FileCode2 size={16} aria-hidden="true" /> Technical details
                </summary>
                <dl>
                  <div>
                    <dt>OCI image</dt>
                    <dd>
                      <code>{rental.run.spec.tag === "Blackbox" ? rental.run.spec.image : ""}</code>
                      <CopyButton value={rental.run.spec.tag === "Blackbox" ? rental.run.spec.image : ""} label="Copy OCI image" />
                    </dd>
                  </div>
                  {rental.composeHash && (
                    <div>
                      <dt>Compose hash</dt>
                      <dd>
                        <code>{rental.composeHash}</code>
                        <CopyButton value={rental.composeHash} label="Copy compose hash" />
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Rental ID</dt>
                    <dd>
                      <code>{rental.run.id}</code>
                      <div className={styles.actions}>
                        <CopyButton value={rental.run.id} label="Copy rental ID" />
                        <CopyButton
                          value={new URL("/console/blackboxes?run=" + rental.run.id, window.location.origin).href}
                          label="Copy rental link"
                        />
                      </div>
                    </dd>
                  </div>
                </dl>
              </details>
            </section>
            <section aria-label="Rental charges">
              <h3>
                <Wallet size={17} aria-hidden="true" /> Rental charges
              </h3>
              <dl className={styles.details}>
                <div>
                  <dt>{rental.active ? "Credits held" : "Original hold"}</dt>
                  <dd>{creditBalance(rental.run.reserve)}</dd>
                </div>
                {!rental.active && (
                  <>
                    <div>
                      <dt>Metered runtime</dt>
                      <dd>{rental.run.seconds} s</dd>
                    </div>
                    <div>
                      <dt>Compute cost</dt>
                      <dd>{creditBalance(rental.run.base)}</dd>
                    </div>
                    <div>
                      <dt>Sonnely fee</dt>
                      <dd>{creditBalance(rental.run.fee)}</dd>
                    </div>
                    <div>
                      <dt>Returned credits</dt>
                      <dd>{creditBalance(rental.run.returned)}</dd>
                    </div>
                    <div className={styles.total}>
                      <dt>Final charge</dt>
                      <dd>{creditBalance(rental.run.charged)}</dd>
                    </div>
                  </>
                )}
              </dl>
              {rental.active && <p className={styles.hint}>Unused credits return to your balance after teardown.</p>}
            </section>
          </div>
        </section>
      ) : owner && available && !rentals.length && !selectionPending && !selectionUnavailable ? null : (
        <section className={styles.empty} aria-labelledby="blackboxes-empty">
          <span className={styles.mark}>
            <Box size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 id="blackboxes-empty">
              {!owner
                ? "Connect a wallet to see your rentals"
                : instances.error && !loaded
                  ? "Rental history unavailable"
                  : selectionPending
                    ? "Loading rental…"
                    : selectionUnavailable
                      ? "Rental unavailable"
                      : !loaded
                        ? "Loading your rentals…"
                        : rentals.length
                          ? "Select a rental to view its details"
                          : "Your rental history is empty"}
            </h2>
            <p>
              {!owner
                ? "Use the wallet control in the console header to manage your Blackboxes."
                : instances.error && !loaded
                  ? "Retry to fetch the rental history for your connected wallet."
                  : selectionPending
                    ? "Fetching the rental record for your wallet."
                    : selectionUnavailable
                      ? "This rental is unavailable for the connected wallet."
                      : loaded && !available
                        ? "New rentals are currently unavailable for this wallet."
                        : rentals.length
                          ? "Open a row in Rental history to see the workload, evidence, and charges."
                          : loaded
                            ? "Start a rental with a digest-pinned image and choose how long the VM should run."
                            : "Checking the rental history for your connected wallet."}
            </p>
          </div>
        </section>
      )}

      {owner && available && !rentals.length && !selectionPending && !selectionUnavailable && (
        <section className={styles.panel} aria-labelledby="blackbox-quickstart">
          <div className={styles.panelHead}>
            <div>
              <h2 id="blackbox-quickstart">Start from a preset</h2>
              <p className={styles.muted}>Choose a container, then review the machine and rental price.</p>
            </div>
          </div>
          <div className={styles.quickstart}>
            {presetIds.map((id) => {
              const Icon = presetIcons[id];
              const option = blackboxPresets[id];
              return (
                <button className={styles.presetCard} type="button" key={id} onClick={() => configure(undefined, id)}>
                  <Icon size={19} aria-hidden="true" />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className={styles.agentQuickstart}>
            <h3>Agent frameworks</h3>
            <p className={styles.muted}>Start with suggested machine settings and bring your configured image.</p>
            <div className={styles.quickstart}>
              {agentPresetIds.map((id) => {
                const option = blackboxAgentPresets[id];
                return (
                  <button className={styles.presetCard} type="button" key={id} onClick={() => configure(undefined, id)}>
                    <Bot size={18} aria-hidden="true" />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {owner && rentals.length > 0 && (
        <section className={styles.panel} aria-labelledby="blackboxes-history">
          <div className={styles.panelHead}>
            <div>
              <h2 id="blackboxes-history">Rental history</h2>
              <p className={styles.muted}>Last 30 rentals</p>
            </div>
            <div className={styles.actions}>
              <span className={styles.metric}>
                <strong>{creditBalance(held)}</strong> held
              </span>
              <span className={styles.metric}>
                <strong>{creditBalance(charged)}</strong> charged
              </span>
              <button type="button" className="button quiet small" onClick={() => void refreshRuns()}>
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
            </div>
          </div>
          <div className={styles.toolbar}>
            <div role="group" aria-label="Filter rental status" className={styles.filters}>
              {filters.map((value) => (
                <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {value}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search rentals"
                placeholder="Search image, port, or ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
          {matched.length ? (
            <ul className={styles.history}>
              {matched.map((view) => (
                <li key={view.run.id}>
                  <button type="button" aria-pressed={view.run.id === rental?.run.id} onClick={() => inspect(view.run.id)}>
                    <span className={styles.rowName}>
                      <Box size={18} aria-hidden="true" />
                      <span>
                        <strong>{blackboxName(view.run)}</strong>
                        <small>
                          {view.times.createdAt !== undefined && <Moment value={view.times.createdAt} />} · {view.run.minutes} min
                        </small>
                      </span>
                    </span>
                    <Status view={view} />
                    <span className={styles.rowCharge}>
                      {creditBalance(view.active ? view.run.reserve : view.run.charged)}
                      <small>{view.active ? "held" : "charged"}</small>
                    </span>
                    <ArrowRight className={styles.rowArrow} size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.notice}>
              No rentals match your filters.{" "}
              <button
                className="button quiet small"
                type="button"
                onClick={() => {
                  setFilter("All rentals");
                  setSearch("");
                }}
              >
                Clear filters
              </button>
            </p>
          )}
        </section>
      )}

      <dialog
        className={styles.dialog}
        aria-labelledby="blackbox-configure"
        ref={composer}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className={styles.dialogHead}>
          <div>
            <h2 id="blackbox-configure">Configure a Blackbox</h2>
            <p className={styles.muted}>Pick a workload, then size your confidential VM.</p>
          </div>
          <button
            type="button"
            className="button quiet small"
            aria-label="Close rental setup"
            disabled={pending}
            onClick={() => composer.current?.close()}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className={styles.formBody}>
            <div className={styles.formGrid}>
              <div className={styles.fields}>
                <fieldset disabled={pending}>
                  <legend>Workload</legend>
                  <div className={styles.workloadGroups} role="group" aria-label="Workload type">
                    <button type="button" aria-pressed={!agentPreset} onClick={() => agentPreset && selectWorkload("nginx")}>
                      Containers
                    </button>
                    <button type="button" aria-pressed={Boolean(agentPreset)} onClick={() => !agentPreset && selectWorkload("hermes")}>
                      Agent frameworks
                    </button>
                  </div>
                  <div className={styles.presetGrid}>
                    {agentPreset ? (
                      agentPresetIds.map((id) => (
                        <WorkloadOption
                          key={id}
                          option={blackboxAgentPresets[id]}
                          icon={Bot}
                          selected={preset === id}
                          onSelect={() => selectWorkload(id)}
                        />
                      ))
                    ) : (
                      <>
                        {presetIds.map((id) => (
                          <WorkloadOption
                            key={id}
                            option={blackboxPresets[id]}
                            icon={presetIcons[id]}
                            selected={preset === id}
                            onSelect={() => selectWorkload(id)}
                          />
                        ))}
                        <WorkloadOption
                          option={{ title: "Custom container", description: "Deploy a public Docker Hub or GHCR image." }}
                          icon={Terminal}
                          selected={preset === "custom"}
                          onSelect={() => selectWorkload("custom")}
                        />
                      </>
                    )}
                  </div>
                </fieldset>
                {selectedPreset ? (
                  <>
                    <input type="hidden" name="image" value={selectedPreset.image} />
                    <input type="hidden" name="port" value={selectedPreset.port} />
                    <details className={styles.presetDetails}>
                      <summary>View pinned image · port {selectedPreset.port}</summary>
                      <code>{selectedPreset.image}</code>
                    </details>
                  </>
                ) : (
                  <div className={styles.customFields}>
                    {agentPreset && (
                      <div className={styles.agentSetup}>
                        <h3>Prepare your {agentPreset.title} image</h3>
                        <p>{agentPreset.setup}</p>
                        <p>
                          Bring a configured Linux amd64 image. Blackboxes gives it a public HTTPS endpoint and currently has no
                          runtime secret injection. Keep credentials out of the image.
                        </p>
                        <a href={agentPreset.docs} target="_blank" rel="noreferrer">
                          {agentPreset.title} setup guide <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </div>
                    )}
                    <label>
                      Public OCI image digest
                      <input
                        name="image"
                        required
                        maxLength={240}
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="ghcr.io/owner/image@sha256:…"
                        value={image}
                        aria-invalid={formError ? true : undefined}
                        aria-describedby={formError ? "blackbox-image-error" : "blackbox-image-help"}
                        onChange={(event) => {
                          setImage(event.target.value);
                          setFormError("");
                        }}
                        disabled={pending}
                      />
                    </label>
                    <p className={styles.hint} id="blackbox-image-help">
                      Pin your public image to a SHA-256 digest.
                    </p>
                    {formError && (
                      <p id="blackbox-image-error" className={styles.error} role="alert">
                        {formError}
                      </p>
                    )}
                    <label>
                      Container HTTP port
                      <input
                        name="port"
                        type="number"
                        inputMode="numeric"
                        required
                        min={1}
                        max={65535}
                        step={1}
                        value={port}
                        onChange={(event) => setPort(event.target.value)}
                        disabled={pending}
                      />
                    </label>
                  </div>
                )}
                <fieldset disabled={pending}>
                  <legend>Machine</legend>
                  <div className={styles.machineGrid}>
                    {blackboxMachineIds.map((id) => {
                      const option = blackboxMachines[id];
                      return (
                        <label key={id} className={styles.choice}>
                          <input type="radio" name="machine" value={id} checked={machine === id} onChange={() => setMachine(id)} />
                          <span>
                            <strong>{option.name}</strong>
                            <small>
                              {option.cpu} vCPU · {option.ram} GB RAM
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset disabled={pending}>
                  <legend>Temporary SSD</legend>
                  <div className={styles.machineGrid}>
                    {blackboxDiskSizes.map((value) => (
                      <label key={value} className={styles.choice}>
                        <input type="radio" name="disk" value={value} checked={disk === value} onChange={() => setDisk(value)} />
                        <span>{value} GB</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset disabled={pending}>
                  <legend>Rental window</legend>
                  <div className={styles.windows}>
                    {blackboxMinutes.map((value) => (
                      <label key={value}>
                        <input type="radio" name="window" value={value} checked={minutes === value} onChange={() => setMinutes(value)} />
                        <span>{value >= 60 ? value / 60 + " hr" : value + " min"}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <aside className={styles.quote} aria-label="Rental quote" ref={quotePanel} tabIndex={-1}>
                <h3>Maximum hold</h3>
                <strong className={styles.price}>{creditBalance(quote.total)}</strong>
                <p className={styles.hint}>
                  {minutes} min · {creditBalance(hourlyRate)}/hr for machine and SSD
                </p>
                <dl className={styles.details}>
                  <div>
                    <dt>Compute cost</dt>
                    <dd>{creditBalance(quote.base)}</dd>
                  </div>
                  <div>
                    <dt>Sonnely fee</dt>
                    <dd>{creditBalance(quote.fee)}</dd>
                  </div>
                  {owner && (
                    <div>
                      <dt>Available credits</dt>
                      <dd>{creditBalance(balance)}</dd>
                    </div>
                  )}
                </dl>
                <dl className={styles.placement}>
                  <div>
                    <dt>Placement</dt>
                    <dd>Automatic</dd>
                  </div>
                  <div>
                    <dt>Workload access</dt>
                    <dd>Public HTTPS after attestation</dd>
                  </div>
                </dl>
                <p className={styles.hint}>
                  An available Intel TDX node is selected automatically. The VM and SSD are deleted at the end of the rental.
                </p>
                <details className={styles.presetDetails}>
                  <summary>How pricing works</summary>
                  <p className={styles.hint}>
                    The fee is {computeMarkup}% of compute cost plus {creditBalance(computeFee)} for a billed run. SSD usage costs{" "}
                    {creditBalance(blackboxDiskHourlyRate)} per GB per hour. Runtime is rounded up to the minute, and unused credits
                    return after teardown.
                  </p>
                </details>
              </aside>
            </div>
            {!owner ? (
              <p className={styles.notice}>Connect your wallet in the console header to rent a Blackbox.</p>
            ) : activeAny ? (
              <p className={styles.notice}>Your wallet can run one compute job at a time. End the active rental before starting another.</p>
            ) : capacityFull ? (
              <p className={styles.notice}>The pilot capacity limit was reached. Try again shortly.</p>
            ) : available && balance < quote.total ? (
              <p className={styles.notice}>
                <a href="/console/billing">Add credits</a> to cover the maximum hold.
              </p>
            ) : null}
            {shownError && (
              <p className={styles.error} role="alert">
                {shownError}
              </p>
            )}
          </div>
          <div className={styles.dialogFooter + " " + styles.rentalFooter}>
            <div className={styles.rentalSummary}>
              <span>
                {blackboxMachines[machine].name} · {disk} GB SSD · {minutes < 60 ? minutes + " min" : minutes / 60 + " hr"}
              </span>
              <button type="button" onClick={() => quotePanel.current?.focus()}>
                Cost breakdown
              </button>
            </div>
            <button type="button" className="button quiet" disabled={pending} onClick={() => composer.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="button accent" disabled={pending || newRentalBlocked || balance < quote.total}>
              {pending ? "Starting rental…" : `Rent Blackbox · up to ${creditBalance(quote.total)}`}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        className={styles.dialog + " " + styles.confirm}
        aria-labelledby="blackbox-end"
        ref={confirmEnd}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className={styles.dialogHead}>
          <h2 id="blackbox-end">End this rental?</h2>
          <button
            type="button"
            className="button quiet small"
            aria-label="Close end rental confirmation"
            disabled={pending}
            onClick={() => confirmEnd.current?.close()}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <p>The workload will go offline and the VM and disk will be deleted. Unused credits return once the rental settles.</p>
        {shownError && (
          <p className={styles.error} role="alert">
            {shownError}
          </p>
        )}
        <div className={styles.dialogFooter}>
          <button type="button" className="button quiet" disabled={pending} autoFocus onClick={() => confirmEnd.current?.close()}>
            Keep rental
          </button>
          <button
            type="button"
            className={"button danger " + styles.danger}
            disabled={pending || !rental?.active || rental.run.stopRequested || rental.run.phase === "Teardown"}
            onClick={() => {
              void stopRental().then((ok) => {
                if (ok) confirmEnd.current?.close();
              });
            }}
          >
            {pending ? "Ending rental…" : "End rental"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
