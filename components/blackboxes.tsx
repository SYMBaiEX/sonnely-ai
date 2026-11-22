import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { WorkspaceHeading } from "./workspace-heading";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Braces,
  Globe2,
  Network,
  Terminal,
  Box,
  CircleCheck,
  Clock3,
  Cpu,
  Download,
  FileCode2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  computeFee,
  computeMarkup,
  computePlans,
  computePrice,
  computeQuote,
  imagePattern,
} from "@/lib/compute";
import {
  blackboxAgentPresets,
  blackboxDiskHourlyRate,
  blackboxDiskSizes,
  blackboxHourlyBase,
  blackboxMachineIds,
  blackboxMachines,
  blackboxPresets,
  blackboxSize,
  defaultBlackboxDisk,
  defaultBlackboxMachine,
  type BlackboxAgentPreset,
  type BlackboxDisk,
  type BlackboxMachine,
  type BlackboxPreset,
} from "@/lib/blackbox-options";
import { creditBalance } from "@/lib/credit-amount";
import type { ComputeRun, ComputeSnapshot } from "./compute";
import { CopyButton } from "./shared";
import type { Session } from "./wallet";
import styles from "./blackboxes.module.css";

const plan = computePlans.blackboxes;
const presetIds = Object.keys(blackboxPresets) as BlackboxPreset[];
const agentPresetIds = Object.keys(blackboxAgentPresets) as BlackboxAgentPreset[];
type Workload = BlackboxPreset | BlackboxAgentPreset | "custom";

function isAgentPreset(preset: Workload): preset is BlackboxAgentPreset {
  return Object.hasOwn(blackboxAgentPresets, preset);
}

const presetIcons = { nginx: Globe2, httpbin: Braces, whoami: Network } as const;
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

type Rental = ComputeRun & { spec: Extract<ComputeRun["spec"], { kind: "blackboxes" }> };
type Filter = "All rentals" | "Active" | "Past";
const filters: Filter[] = ["All rentals", "Active", "Past"];
const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function isRental(run: ComputeRun | undefined): run is Rental {
  return run?.spec.kind === "blackboxes";
}

function rentalName(rental: Rental) {
  return rental.spec.image.split("@")[0];
}

function rentalStatus(rental: Rental) {
  if (rental.phase === "settled") {
    return { completed: "Completed", stopped: "Ended early", expired: "Expired", failed: "Failed" }[
      rental.result ?? "completed"
    ];
  }
  if (rental.phase === "teardown" || rental.stopRequested) return "Tearing down";
  if (rental.phase === "running") return "Running";
  if (rental.phase === "provisioning") return "Provisioning";
  return "Queued";
}

function Status({ rental }: { rental: Rental }) {
  return (
    <span className={styles.status} data-running={rentalStatus(rental) === "Running" || undefined}>
      <span aria-hidden="true" />
      {rentalStatus(rental)}
    </span>
  );
}

function Moment({ value }: { value: number }) {
  return <time dateTime={new Date(value).toISOString()}>{date.format(value)}</time>;
}

function Remaining({ rental }: { rental: Rental }) {
  const [now, setNow] = useState(0);
  const expiresAt = rental.expiresAt;
  useEffect(() => {
    if (!expiresAt || !rental.active || rental.stopRequested || rental.phase === "teardown") return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, rental.active, rental.stopRequested, rental.phase]);

  if (!rental.active || rental.stopRequested || rental.phase === "teardown") return null;
  if (!expiresAt || !now)
    return <p className={styles.muted}>The rental timer starts when provisioning begins.</p>;
  const total = rental.minutes * 60;
  const remaining = Math.min(total, Math.max(0, Math.ceil((expiresAt - now) / 1000)));
  const clock = Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0");
  return (
    <div className={styles.countdown}>
      <div className={styles.between}>
        <span>
          <Clock3 size={15} aria-hidden="true" /> <strong>{clock}</strong> remaining
        </span>
        <span>
          Ends <Moment value={expiresAt} />
        </span>
      </div>
      <progress aria-label="Rental time used" value={total - remaining} max={total} />
    </div>
  );
}

const phases = ["queued", "provisioning", "running", "teardown", "settled"] as const;
function Timeline({ rental }: { rental: Rental }) {
  const current = phases.indexOf(rental.stopRequested && rental.active ? "teardown" : rental.phase);
  const milestones = [
    { label: "Queued", time: rental.createdAt },
    { label: "Provisioning", time: rental.startedAt },
    { label: "Attested", time: rental.evidenceAt },
    { label: "Teardown", time: rental.teardownAt },
    { label: "Settled", time: rental.settledAt },
  ];
  return (
    <ol className={styles.timeline} aria-label="Rental lifecycle">
      {milestones.map(({ label, time }, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          data-done={time !== undefined || undefined}
        >
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

export function Blackboxes({
  session,
  snapshot,
  run,
  runs,
  pending,
  loadError,
  actionError,
  onSelect,
  onOpen,
  onStop,
  onRefresh,
  onClearError,
  selectionPending,
  selectionUnavailable,
}: {
  session?: Session | null;
  snapshot?: ComputeSnapshot;
  run?: ComputeRun;
  runs: ComputeRun[];
  pending: boolean;
  loadError: string;
  actionError: string;
  onSelect: (id: string) => void;
  onOpen: (event: FormEvent<HTMLFormElement>, minutes: number) => Promise<boolean>;
  onStop: () => Promise<boolean>;
  onRefresh: () => void;
  onClearError: () => void;
  selectionPending: boolean;
  selectionUnavailable: boolean;
}) {
  const rental = isRental(run) ? run : undefined;
  const rentals = runs.filter(isRental);
  const active = rentals.find((item) => item.active);
  const [filter, setFilter] = useState<Filter>("All rentals");
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<Workload>("nginx");
  const [machine, setMachine] = useState<BlackboxMachine>(defaultBlackboxMachine);
  const [disk, setDisk] = useState<BlackboxDisk>(defaultBlackboxDisk);
  const [minutes, setMinutes] = useState<number>(plan.minutes[0]);
  const [image, setImage] = useState("");
  const [port, setPort] = useState("8080");
  const [formError, setFormError] = useState("");
  const composer = useRef<HTMLDialogElement>(null);
  const confirmEnd = useRef<HTMLDialogElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const owner = Boolean(session?.profile);
  const balance = session?.profile?.balance ?? 0;
  const agentPreset = isAgentPreset(preset) ? blackboxAgentPresets[preset] : undefined;
  const selectedPreset = preset === "custom" || isAgentPreset(preset) ? undefined : blackboxPresets[preset];
  const hourlyRate = blackboxHourlyBase(machine, disk);
  const quote = computePrice(hourlyRate, plan.unitSeconds, minutes * 60);
  const held = rentals.reduce((sum, item) => sum + (item.active ? item.reserve : 0), 0);
  const charged = rentals.reduce((sum, item) => sum + (item.charged ?? 0), 0);
  const matched = rentals.filter(
    (item) =>
      (filter === "All rentals" || item.active === (filter === "Active")) &&
      (item.spec.image + " " + item.id + " " + item.spec.port)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const endpoint = rental && !rental.stopRequested ? rental.endpoint : undefined;
  const file = rental
    ? "/api/sonnely/compute?id=" + encodeURIComponent(rental.id) + "&file=evidence"
    : undefined;
  const access = !owner
    ? "Connect wallet"
    : snapshot
      ? snapshot.enabled
        ? "Rentals available"
        : "Rentals unavailable"
      : "Checking availability";
  const newRentalBlocked = !snapshot?.enabled || Boolean(active) || Boolean(session?.termsRequired);

  function inspect(id: string) {
    onSelect(id);
    requestAnimationFrame(() => detailHeading.current?.focus());
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

  function configure(from?: Rental, initialPreset: Workload = "nginx") {
    onClearError();
    setFormError("");
    const savedPreset =
      from &&
      presetIds.find((id) => {
        const option = blackboxPresets[id];
        return from.spec.image === option.image && from.spec.port === option.port;
      });
    selectWorkload(from ? (savedPreset ?? "custom") : initialPreset, true);
    if (from) {
      setImage(from.spec.image);
      setPort(String(from.spec.port));
      setMachine(from.spec.machine ?? defaultBlackboxMachine);
      setDisk(from.spec.disk ?? defaultBlackboxDisk);
    }
    setMinutes(from?.minutes ?? plan.minutes[0]);
    composer.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPreset && !imagePattern.test(image.trim())) {
      setFormError(
        "Enter a Docker Hub or GHCR image pinned with @sha256: followed by its 64-character digest.",
      );
      const field = event.currentTarget.elements.namedItem("image");
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }
    setFormError("");
    if (await onOpen(event, minutes)) composer.current?.close();
  }

  return (
    <div className={styles.workspace}>
      <WorkspaceHeading
        icon={Box}
        title="Blackboxes"
        description="Start from a container preset or bring your own image to a Phala confidential VM."
      >
        <Link className="button quiet" href="/docs/blackboxes">
          Rental guide <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
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
          <dd>{creditBalance(computeQuote("blackboxes", 15).total)}</dd>
        </div>
        <div>
          <dt>
            <ShieldCheck size={16} aria-hidden="true" /> Availability
          </dt>
          <dd>{access}</dd>
        </div>
      </dl>

      {loadError && (
        <div className={styles.notice} role="alert">
          <span>Rental status could not refresh. {loadError}</span>
          <button type="button" className="button quiet small" onClick={onRefresh}>
            Try again
          </button>
        </div>
      )}

      {rental ? (
        <section className={styles.panel} aria-labelledby="rental-name">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.kicker}>{rental.active ? "Active rental" : "Rental details"}</p>
              <h2 id="rental-name" ref={detailHeading} tabIndex={-1}>
                {rentalName(rental)}
              </h2>
            </div>
            <Status rental={rental} />
          </div>
          <div className={styles.controls}>
            {endpoint && (
              <>
                <a className="button accent" href={endpoint} target="_blank" rel="noreferrer">
                  Open workload <ArrowUpRight size={15} aria-hidden="true" />
                </a>
                <CopyButton key={rental.id + "-endpoint"} value={endpoint} label="Copy endpoint" />
              </>
            )}
            {rental.hasEvidence && (
              <a className="button quiet" href={file}>
                <Download size={16} aria-hidden="true" /> Download attestation
              </a>
            )}
            {!rental.active && (
              <button className="button quiet" type="button" onClick={() => configure(rental)}>
                <Plus size={16} aria-hidden="true" /> Rent this image again
              </button>
            )}
            {rental.active && !rental.stopRequested && rental.phase !== "teardown" && (
              <button
                className={"button quiet " + styles.end}
                type="button"
                disabled={pending}
                onClick={() => {
                  onClearError();
                  confirmEnd.current?.showModal();
                }}
              >
                <Square size={14} aria-hidden="true" /> End rental
              </button>
            )}
            {active && active.id !== rental.id && (
              <button className="button quiet" type="button" onClick={() => inspect(active.id)}>
                View active rental <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <Remaining key={rental.id} rental={rental} />
          {rental.message && <p className={styles.notice}>{rental.message}</p>}
          <Timeline rental={rental} />
          <div className={styles.detailGrid}>
            <section aria-label="Workload and evidence" key={rental.id}>
              <h3>
                <ShieldCheck size={17} aria-hidden="true" /> Workload and evidence
              </h3>
              <dl className={styles.details}>
                <div>
                  <dt>Machine and disk</dt>
                  <dd>{blackboxSize(rental.spec.machine, rental.spec.disk)}</dd>
                </div>
                <div>
                  <dt>Container port</dt>
                  <dd>{rental.spec.port}</dd>
                </div>
                <div>
                  <dt>Rental window</dt>
                  <dd>{rental.minutes} min</dd>
                </div>
                <div>
                  <dt>Attestation</dt>
                  <dd>
                    {rental.hasEvidence
                      ? "Evidence available"
                      : rental.active
                        ? "Awaiting evidence"
                        : rental.evidenceAt
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
                {rental.evidenceAt !== undefined && (
                  <div>
                    <dt>Evidence captured</dt>
                    <dd>
                      <Moment value={rental.evidenceAt} />
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
                      <code>{rental.spec.image}</code>
                      <CopyButton value={rental.spec.image} label="Copy OCI image" />
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
                      <code>{rental.id}</code>
                      <div className={styles.actions}>
                        <CopyButton value={rental.id} label="Copy rental ID" />
                        <CopyButton
                          value={new URL("/console/blackboxes?run=" + rental.id, window.location.origin).href}
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
                  <dd>{creditBalance(rental.reserve)}</dd>
                </div>
                {!rental.active && (
                  <>
                    <div>
                      <dt>Metered runtime</dt>
                      <dd>{rental.seconds ?? 0} s</dd>
                    </div>
                    <div>
                      <dt>Provider cost</dt>
                      <dd>{creditBalance(rental.base ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Sonnely fee</dt>
                      <dd>{creditBalance(rental.fee ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Returned credits</dt>
                      <dd>{creditBalance(rental.reserve - (rental.charged ?? 0))}</dd>
                    </div>
                    <div className={styles.total}>
                      <dt>Final charge</dt>
                      <dd>{creditBalance(rental.charged ?? 0)}</dd>
                    </div>
                  </>
                )}
              </dl>
              {rental.active && (
                <p className={styles.hint}>Unused credits return to your balance after teardown.</p>
              )}
            </section>
          </div>
        </section>
      ) : snapshot?.enabled && !rentals.length && !selectionPending && !selectionUnavailable ? null : (
        <section className={styles.empty} aria-labelledby="blackboxes-empty">
          <span className={styles.mark}>
            <Box size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 id="blackboxes-empty">
              {!owner
                ? "Connect a wallet to see your rentals"
                : loadError && !snapshot
                  ? "Rental history unavailable"
                  : selectionPending
                    ? "Loading rental…"
                    : selectionUnavailable
                      ? "Rental unavailable"
                      : !snapshot
                        ? "Loading your rentals…"
                        : rentals.length
                          ? "Select a rental to view its details"
                          : "Your rental history is empty"}
            </h2>
            <p>
              {!owner
                ? "Use the wallet control in the console header to manage your Blackboxes."
                : loadError && !snapshot
                  ? "Retry to fetch the rental history for your connected wallet."
                  : selectionPending
                    ? "Fetching the rental record for your wallet."
                    : selectionUnavailable
                      ? "This rental is unavailable for the connected wallet."
                      : snapshot && !snapshot.enabled
                        ? "New rentals are currently unavailable for this wallet."
                        : rentals.length
                          ? "Open a row in Rental history to see the workload, evidence, and charges."
                          : snapshot
                            ? "Start a rental with a digest-pinned image and choose how long the VM should run."
                            : "Checking the rental history for your connected wallet."}
            </p>
          </div>
        </section>
      )}

      {snapshot?.enabled && !rentals.length && !selectionPending && !selectionUnavailable && (
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
                <button
                  className={styles.presetCard}
                  type="button"
                  key={id}
                  onClick={() => configure(undefined, id)}
                >
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
            <p className={styles.muted}>
              Start with suggested Phala settings and bring your configured image.
            </p>
            <div className={styles.quickstart}>
              {agentPresetIds.map((id) => {
                const option = blackboxAgentPresets[id];
                return (
                  <button
                    className={styles.presetCard}
                    type="button"
                    key={id}
                    onClick={() => configure(undefined, id)}
                  >
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
              <button type="button" className="button quiet small" onClick={onRefresh}>
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
            </div>
          </div>
          <div className={styles.toolbar}>
            <div role="group" aria-label="Filter rental status" className={styles.filters}>
              {filters.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
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
              {matched.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === rental?.id}
                    onClick={() => inspect(item.id)}
                  >
                    <span className={styles.rowName}>
                      <Box size={18} aria-hidden="true" />
                      <span>
                        <strong>{rentalName(item)}</strong>
                        <small>
                          <Moment value={item.createdAt} /> · {item.minutes} min
                        </small>
                      </span>
                    </span>
                    <Status rental={item} />
                    <span className={styles.rowCharge}>
                      {creditBalance(item.active ? item.reserve : (item.charged ?? 0))}
                      <small>{item.active ? "held" : "charged"}</small>
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
            <p className={styles.muted}>Pick a workload, then size your Phala confidential VM.</p>
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
        <form onSubmit={submit}>
          <div className={styles.formBody}>
            <div className={styles.formGrid}>
              <div className={styles.fields}>
                <fieldset disabled={pending}>
                  <legend>Workload</legend>
                  <div className={styles.workloadGroups} role="group" aria-label="Workload type">
                    <button
                      type="button"
                      aria-pressed={!agentPreset}
                      onClick={() => agentPreset && selectWorkload("nginx")}
                    >
                      Containers
                    </button>
                    <button
                      type="button"
                      aria-pressed={Boolean(agentPreset)}
                      onClick={() => !agentPreset && selectWorkload("hermes")}
                    >
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
                          option={{
                            title: "Custom container",
                            description: "Deploy a public Docker Hub or GHCR image.",
                          }}
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
                          Bring a configured Linux amd64 image. Blackboxes gives it a public HTTPS endpoint
                          and currently has no runtime secret injection. Keep credentials out of the image.
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
                  <legend>Phala machine</legend>
                  <div className={styles.machineGrid}>
                    {blackboxMachineIds.map((id) => {
                      const option = blackboxMachines[id];
                      return (
                        <label key={id} className={styles.choice}>
                          <input
                            type="radio"
                            name="machine"
                            value={id}
                            checked={machine === id}
                            onChange={() => setMachine(id)}
                          />
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
                        <input
                          type="radio"
                          name="disk"
                          value={value}
                          checked={disk === value}
                          onChange={() => setDisk(value)}
                        />
                        <span>{value} GB</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset disabled={pending}>
                  <legend>Rental window</legend>
                  <div className={styles.windows}>
                    {plan.minutes.map((value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="window"
                          value={value}
                          checked={minutes === value}
                          onChange={() => setMinutes(value)}
                        />
                        <span>{value >= 60 ? value / 60 + " hr" : value + " min"}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <aside className={styles.quote} aria-label="Rental quote">
                <h3>Maximum hold</h3>
                <strong className={styles.price}>{creditBalance(quote.total)}</strong>
                <p className={styles.hint}>
                  {minutes} min · {creditBalance(hourlyRate)}/hr for machine and SSD
                </p>
                <dl className={styles.details}>
                  <div>
                    <dt>Provider cost</dt>
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
                    <dd>Automatic · Phala Cloud</dd>
                  </div>
                  <div>
                    <dt>Workload access</dt>
                    <dd>Public HTTPS after attestation</dd>
                  </div>
                </dl>
                <p className={styles.hint}>
                  Phala selects an available Intel TDX node. The VM and SSD are deleted at the end of the
                  rental.
                </p>
                <details className={styles.presetDetails}>
                  <summary>How pricing works</summary>
                  <p className={styles.hint}>
                    The fee is {computeMarkup}% of provider cost plus {creditBalance(computeFee)} for a billed
                    run. SSD usage costs {creditBalance(blackboxDiskHourlyRate)} per GB per hour. Runtime is
                    rounded up to the minute, and unused credits return after teardown.
                  </p>
                </details>
              </aside>
            </div>
            {!owner ? (
              <p className={styles.notice}>Connect your wallet in the console header to rent a Blackbox.</p>
            ) : session?.termsRequired ? (
              <p className={styles.notice}>
                Accept the current Sonnely terms in the console to start a rental.
              </p>
            ) : active ? (
              <p className={styles.notice}>
                Your wallet can run one compute job at a time. End the active rental before starting another.
              </p>
            ) : snapshot && !snapshot.enabled ? (
              <p className={styles.notice}>New rentals are currently unavailable for this wallet.</p>
            ) : snapshot?.enabled && balance < quote.total ? (
              <p className={styles.notice}>
                <Link href="/console/billing">Add credits</Link> to cover the maximum hold.
              </p>
            ) : null}
            {actionError && (
              <p className={styles.error} role="alert">
                {actionError}
              </p>
            )}
          </div>
          <div className={styles.dialogFooter}>
            <button
              type="button"
              className="button quiet"
              disabled={pending}
              onClick={() => composer.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button accent"
              disabled={pending || newRentalBlocked || balance < quote.total}
            >
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
        <p>
          The workload will go offline and Phala will delete the VM and disk. Unused credits return once the
          rental settles.
        </p>
        {actionError && (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        )}
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className="button quiet"
            disabled={pending}
            autoFocus
            onClick={() => confirmEnd.current?.close()}
          >
            Keep rental
          </button>
          <button
            type="button"
            className={"button danger " + styles.danger}
            disabled={pending || !rental?.active || rental.stopRequested || rental.phase === "teardown"}
            onClick={async () => {
              if (await onStop()) confirmEnd.current?.close();
            }}
          >
            {pending ? "Ending rental…" : "End rental"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
