// spec/app/compute/instances.md, "Story: Rent a confidential machine": the Docks section — a Dry Dock builds a
// pinned GitHub commit in a confidential VM and hands back its artifact; no attestation, the build log is the evidence.
import { CircleCheck, Clock3, Container, GitBranch, Hammer, Plus, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, EmptyState, Input, Label } from "@repo/ui";
import { quote, quoteFor, hourlyBaseOf, unitOf } from "../../../../gen/app__compute__instances.ts";
import type { Compute, Run } from "../../../../gen/app__compute__instances.ts";
import type { Session } from "../../../../gen/app__session.ts";
import { useRemote } from "../../remote.ts";
import {
  creditBalance,
  describeWorkload,
  dockMinutes,
  isLive,
  repositoryPattern,
  revisionPattern,
  runStatus,
  runTitle,
  stepIndex,
} from "./shared.tsx";

const steps = ["Queued", "Provisioning", "Running", "Teardown", "Settled"] as const;

function Timeline({ run }: { run: Run }) {
  const current = stepIndex(run);
  return (
    <ol aria-label="Build lifecycle" className="flex flex-wrap gap-4 text-xs">
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={index <= current ? "font-medium text-foreground" : "text-muted-foreground"}
        >
          <span className="mr-1 inline-block align-middle" aria-hidden="true">
            {index < current && <CircleCheck size={13} className="text-emerald-600" />}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function DockCard({ run, onStop }: { run: Run; onStop: (id: string) => void }) {
  const live = isLive(run);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{live ? "Active build" : "Past build"}</p>
          <h3 className="font-medium break-all">{runTitle(run)}</h3>
          <p className="text-xs text-muted-foreground">{describeWorkload(run.spec)}</p>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">{runStatus(run)}</span>
      </div>
      <Timeline run={run} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          <Hammer size={13} className="mr-1 inline align-middle" aria-hidden="true" />
          2 vCPU · 4 GB RAM · build log is the evidence
        </span>
        <span>
          Window {run.minutes} min · hold {creditBalance(run.reserve)}
        </span>
        {run.phase === "Settled" && (
          <span>
            Billed {creditBalance(run.charged)} for {run.seconds}s · returned{" "}
            {creditBalance(run.returned)}
          </span>
        )}
      </div>
      {live && !run.stopRequested && (
        <div>
          <Button variant="outline" size="sm" onClick={() => onStop(run.id)}>
            Stop build
          </Button>
        </div>
      )}
    </Card>
  );
}

function NewBuild({ wallet, disabled, send }: { wallet: string; disabled: boolean; send: (input: unknown) => Promise<boolean> }) {
  const [repository, setRepository] = useState("");
  const [revision, setRevision] = useState("");
  const [minutes, setMinutes] = useState<number>(dockMinutes[0]);
  const [formError, setFormError] = useState("");

  const spec = { tag: "DryDock", repository: repository.trim(), revision: revision.trim() } as const;
  const repoOk = repositoryPattern.test(spec.repository);
  const revisionOk = revisionPattern.test(spec.revision);
  const priced = quoteFor(hourlyBaseOf(spec), unitOf(spec), minutes * 60);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repoOk) {
      setFormError("Enter a GitHub URL such as https://github.com/owner/repo.");
      return;
    }
    if (!revisionOk) {
      setFormError("Enter the full 40-character commit SHA to build.");
      return;
    }
    setFormError("");
    await send({
      type: "open",
      id: crypto.randomUUID(),
      reference: crypto.randomUUID(),
      wallet,
      spec,
      minutes,
    });
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium">New build</h3>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="dd-repo">Repository</Label>
            <Input
              id="dd-repo"
              name="repository"
              placeholder="https://github.com/owner/repo"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="dd-rev">Commit SHA</Label>
            <Input
              id="dd-rev"
              name="revision"
              placeholder="40-character SHA"
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dd-minutes">Build window</Label>
            <select
              id="dd-minutes"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              {dockMinutes.map((window) => (
                <option key={window} value={window}>
                  {window} min
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Hold <strong className="text-foreground">{creditBalance(priced.total)}</strong> · the dock is billed
            only for the seconds the build metered
          </p>
          <Button type="submit" disabled={disabled || !repoOk || !revisionOk}>
            <Plus size={16} aria-hidden="true" /> Build for {creditBalance(priced.total)}
          </Button>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
      </form>
    </Card>
  );
}

export function Docks() {
  const instances = useRemote<Compute>("instances");
  const session = useRemote<Session>("session");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const docks = (instances.state?.runs ?? []).filter((run) => run.kind === "DryDocks");
  const active = docks.filter(isLive);

  if (!wallet) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pt-24">
        <EmptyState title="Sign in to open a Dry Dock" icon={<Wallet size={20} aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">
            Confidential builds of a pinned commit; connect a wallet to hold a dock.
          </p>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 pt-24">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Dry Docks</h1>
          <p className="text-sm text-muted-foreground">
            Build a pinned GitHub commit in a confidential VM.
          </p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Container size={14} aria-hidden="true" /> Build machine
          </dt>
          <dd className="text-sm">2 vCPU · 4 GB RAM</dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 size={14} aria-hidden="true" /> Build window
          </dt>
          <dd className="text-sm">5 to 15 min</dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet size={14} aria-hidden="true" /> Starting hold
          </dt>
          <dd className="text-sm">
            {creditBalance(quote({ tag: "DryDock", repository: "repo", revision: "rev" }, 5))}
          </dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch size={14} aria-hidden="true" /> Active builds
          </dt>
          <dd className="text-sm">{active.length} of 4 per kind</dd>
        </div>
      </dl>
      {instances.error && (
        <p role="alert" className="text-sm text-destructive">
          {instances.error}
        </p>
      )}
      <NewBuild wallet={wallet} disabled={active.length >= 4} send={instances.send} />
      {docks.length === 0 ? (
        <EmptyState title="No builds yet" icon={<Hammer size={20} aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">Docks you open appear here through their lifecycle.</p>
        </EmptyState>
      ) : (
        <section aria-label="Builds" className="flex flex-col gap-3">
          {docks.map((run) => (
            <DockCard key={run.id} run={run} onStop={(id) => void instances.send({ type: "stop", id })} />
          ))}
        </section>
      )}
    </main>
  );
}
