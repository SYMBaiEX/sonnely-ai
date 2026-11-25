// spec/app/compute/instances.md, "Story: Rent a confidential machine": the Consoles section — rent a
// digest-pinned image on a confidential TDX machine, watch its attestation, stop it, and see what it cost.
import { Box, CircleCheck, Clock3, Cpu, Plus, ShieldCheck, Square, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, EmptyState, Input, Label } from "@repo/ui";
import { quote, quoteFor, hourlyBaseOf, unitOf } from "../../../../gen/app__compute__instances.ts";
import type { Compute, Run } from "../../../../gen/app__compute__instances.ts";
import type { Session } from "../../../../gen/app__session.ts";
import { useRemote } from "../../remote.ts";
import {
  blackboxDisks,
  blackboxMachines,
  blackboxMinutes,
  creditBalance,
  describeWorkload,
  imagePattern,
  isLive,
  runStatus,
  runTitle,
  stepIndex,
} from "./shared.tsx";

const steps = ["Queued", "Provisioning", "Running", "Teardown", "Settled"] as const;

function Timeline({ run }: { run: Run }) {
  const current = stepIndex(run);
  return (
    <ol aria-label="Rental lifecycle" className="flex flex-wrap gap-4 text-xs">
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

function Attestation({ run }: { run: Run }) {
  const label =
    run.attestation === "Verified"
      ? "Attestation verified"
      : run.attestation === "Rejected"
        ? "Attestation rejected"
        : run.attestation === "Pending"
          ? "Attestation pending"
          : "No attestation";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck size={14} aria-hidden="true" /> {label}
    </span>
  );
}

function RunCard({ run, onStop }: { run: Run; onStop: (id: string) => void }) {
  const live = isLive(run);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{live ? "Active rental" : "Past rental"}</p>
          <h3 className="font-medium break-all">{runTitle(run)}</h3>
          <p className="text-xs text-muted-foreground">{describeWorkload(run.spec)}</p>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">{runStatus(run)}</span>
      </div>
      <Timeline run={run} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <Attestation run={run} />
        <span>
          Lease {run.minutes} min · hold {creditBalance(run.reserve)}
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
            <Square size={14} aria-hidden="true" /> End rental
          </Button>
        </div>
      )}
    </Card>
  );
}

function NewRental({ wallet, disabled, send }: { wallet: string; disabled: boolean; send: (input: unknown) => Promise<boolean> }) {
  const [image, setImage] = useState("");
  const [port, setPort] = useState("8080");
  const [machine, setMachine] = useState<string>("tdx.small");
  const [disk, setDisk] = useState<number>(20);
  const [minutes, setMinutes] = useState<number>(blackboxMinutes[0]);
  const [formError, setFormError] = useState("");

  const spec = {
    tag: "Blackbox",
    image: image.trim(),
    port: Number.parseInt(port, 10) || 0,
    machine,
    disk,
  } as const;
  const imageOk = imagePattern.test(spec.image);
  const priced = quoteFor(hourlyBaseOf(spec), unitOf(spec), minutes * 60);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!imageOk) {
      setFormError("Enter a Docker Hub or GHCR image pinned with @sha256: followed by its 64-character digest.");
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
      <h3 className="mb-3 font-medium">New rental</h3>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bb-image">Container image</Label>
          <Input
            id="bb-image"
            name="image"
            placeholder="docker.io/library/nginx@sha256:…"
            value={image}
            onChange={(event) => setImage(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Pinned by digest: docker.io or ghcr.io, then @sha256: and 64 hex characters.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bb-machine">Machine</Label>
            <select
              id="bb-machine"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={machine}
              onChange={(event) => setMachine(event.target.value)}
            >
              {blackboxMachines.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {option.detail}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bb-disk">SSD</Label>
            <select
              id="bb-disk"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={disk}
              onChange={(event) => setDisk(Number(event.target.value))}
            >
              {blackboxDisks.map((size) => (
                <option key={size} value={size}>
                  {size} GB
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bb-port">Port</Label>
            <Input id="bb-port" name="port" value={port} onChange={(event) => setPort(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bb-minutes">Rental window</Label>
            <select
              id="bb-minutes"
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              {blackboxMinutes.map((window) => (
                <option key={window} value={window}>
                  {window} min
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Hold <strong className="text-foreground">{creditBalance(priced.total)}</strong> · returns what the
            run does not use
          </p>
          <Button type="submit" disabled={disabled || !imageOk}>
            <Plus size={16} aria-hidden="true" /> Rent for {creditBalance(priced.total)}
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

export function Consoles() {
  const instances = useRemote<Compute>("instances");
  const session = useRemote<Session>("session");
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const rentals = (instances.state?.runs ?? []).filter((run) => run.kind === "Blackboxes");
  const active = rentals.filter(isLive);

  if (!wallet) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pt-24">
        <EmptyState title="Sign in to rent a Blackbox" icon={<Wallet size={20} aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">
            Confidential VMs rented by the minute; connect a wallet to hold a rental.
          </p>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 pt-24">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Blackboxes</h1>
          <p className="text-sm text-muted-foreground">
            Bring a digest-pinned image to a confidential TDX machine.
          </p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cpu size={14} aria-hidden="true" /> Resources
          </dt>
          <dd className="text-sm">1–4 vCPU · 2–8 GB RAM</dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 size={14} aria-hidden="true" /> Rental window
          </dt>
          <dd className="text-sm">15 min to 2 hr</dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet size={14} aria-hidden="true" /> Starting hold
          </dt>
          <dd className="text-sm">
            {creditBalance(
              quote({ tag: "Blackbox", image: "img", port: 8080, machine: "tdx.small", disk: 20 }, 15),
            )}
          </dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck size={14} aria-hidden="true" /> Active rentals
          </dt>
          <dd className="text-sm">{active.length} of 2 per kind</dd>
        </div>
      </dl>
      {instances.error && (
        <p role="alert" className="text-sm text-destructive">
          {instances.error}
        </p>
      )}
      <NewRental wallet={wallet} disabled={active.length >= 2} send={instances.send} />
      {rentals.length === 0 ? (
        <EmptyState title="No rentals yet" icon={<Box size={20} aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">Rentals you open appear here through their lifecycle.</p>
        </EmptyState>
      ) : (
        <section aria-label="Rentals" className="flex flex-col gap-3">
          {rentals.map((run) => (
            <RunCard key={run.id} run={run} onStop={(id) => void instances.send({ type: "stop", id })} />
          ))}
        </section>
      )}
    </main>
  );
}
