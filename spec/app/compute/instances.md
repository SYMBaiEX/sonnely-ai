# Compute instances

A compute run is a rented machine: a Blackbox is a confidential Intel TDX VM
serving a digest-pinned OCI image over public HTTPS once its attestation is
verified, and a Dry Dock is a clean Boat sandbox that builds a pinned GitHub
commit. A wallet opens a run for a rental window, a maximum hold of credits
is reserved up front, the provider drives it through its phases, and the
hold is settled against metered time when it ends.

## Domain

### A run moves queued, provisioning, running, teardown, settled — or settles early

The phases a compute run passes through. `Queued` waits for the provider to
launch, `Provisioning` covers the billable resource being created and, for a
Blackbox, its attestation evidence being verified, `Running` is the workload
serving, `Teardown` is the machine being deleted, and `Settled` is final: the
hold has been charged and the rest returned.

```quint
type Kind = Blackboxes | DryDocks

type Phase = Queued | Provisioning | Running | Teardown | Settled
```

### A settled run reports completed, failed, stopped or expired

How a run ended; `Ongoing` while it has not.

```quint
type Result = Ongoing | Completed | Failed | Stopped | Expired
```

### A Blackbox's attestation is pending until verified or rejected

A Blackbox only serves once the provider's evidence is verified: the
hardware quote checks out as proof of cloud, and the measured compose hash,
app id and instance id match what was launched. A Dry Dock needs no
attestation.

```quint
type Attestation = Pending | Verified | Rejected | Absent
```

### A workload is a pinned OCI image or a pinned GitHub commit

A Blackbox workload is a public Docker Hub or GHCR image pinned to a
SHA-256 digest, the container's HTTP port, a `tdx.*` machine size and a
temporary SSD size. A Dry Dock workload is a public GitHub repository URL
and the full 40-character commit SHA to build.

```quint
type Workload =
  | Blackbox({ image: str, port: int, machine: str, disk: int })
  | DryDock({ repository: str, revision: str })

type Run = {
  id: str,
  reference: str,
  wallet: str,
  kind: Kind,
  spec: Workload,
  minutes: int,
  reserve: int,
  phase: Phase,
  result: Result,
  attestation: Attestation,
  stopRequested: bool,
  seconds: int,
  base: int,
  fee: int,
  charged: int,
  returned: int,
}

type Compute = { runs: List[Run] }
```

### No runs exist at first

```quint
pure val initial: Compute = { runs: List() }
```

### A Blackbox comes in three TDX sizes and three SSD sizes

`tdx.small` is 1 vCPU with 2 GB RAM, `tdx.medium` 2 vCPU with 4 GB RAM and
`tdx.large` 4 vCPU with 8 GB RAM; temporary SSD comes as 20, 40 or 80 GB and
costs 139 micro-USD per GB per hour on top of the machine's hourly compute
rate. A Dry Dock is always a `small` Boat sandbox: 2 vCPU and 4 GB RAM at
18,000 micro-USD per hour.

```quint
pure def machineCompute(machine: str): int =
  if (machine == "tdx.large") 232000
  else if (machine == "tdx.medium") 116000
  else 58000

pure def hourlyBaseOf(spec: Workload): int =
  match spec {
    | Blackbox(b) => machineCompute(b.machine) + b.disk * 139
    | DryDock(_) => 18000
  }
```

### The fee is 25% of compute cost plus 10,000 micro-USD for a billed run

Runtime is rounded up to the billing unit — a minute for a Blackbox, a
second for a Dry Dock — the base is the hourly rate pro-rated by those
units, and the Sonnely fee is a fixed 10,000 micro-USD plus a 25% markup on
the base whenever anything was billed.

```quint
pure def unitOf(spec: Workload): int =
  match spec { | Blackbox(_) => 60 | DryDock(_) => 1 }

pure def ceilDiv(a: int, b: int): int =
  if (b <= 0 or a <= 0) 0 else (a + b - 1) / b

type Quote = { base: int, fee: int, total: int }

pure def quoteFor(rate: int, unit: int, seconds: int): Quote =
  val units = ceilDiv(seconds, unit)
  val base = ceilDiv(rate * units * unit, 3600)
  val fee = if (units == 0) 0 else 10000 + ceilDiv(base * 25, 100)
  { base: base, fee: fee, total: base + fee }

pure def quote(spec: Workload, minutes: int): int =
  quoteFor(hourlyBaseOf(spec), unitOf(spec), minutes * 60).total
```

### A Blackbox rents for 15 to 120 minutes, a Dry Dock for 5 to 15

The supported rental windows: 15, 30, 60 or 120 minutes for a Blackbox and
5, 10 or 15 minutes for a Dry Dock.

```quint
pure def windowAllowed(spec: Workload, minutes: int): bool =
  match spec {
    | Blackbox(_) => List(15, 30, 60, 120).includes(minutes)
    | DryDock(_) => List(5, 10, 15).includes(minutes)
  }
```

### A workload must name a digest-pinned image and port, or a repository and full SHA

The image is under 240 characters, the port is 1 to 65535, the machine is
`tdx.small`, `tdx.medium` or `tdx.large`, the disk is 20, 40 or 80 GB, and a
Dry Dock names a public GitHub repository and a commit SHA.

```quint
pure def validSpec(spec: Workload): bool =
  match spec {
    | Blackbox(b) =>
        b.image != "" and b.port >= 1 and b.port <= 65535 and
        List("tdx.small", "tdx.medium", "tdx.large").includes(b.machine) and
        List(20, 40, 80).includes(b.disk)
    | DryDock(d) => d.repository != "" and d.revision != ""
  }

pure def kindOf(spec: Workload): Kind =
  match spec { | Blackbox(_) => Blackboxes | DryDock(_) => DryDocks }

pure def isActive(x: Run): bool = x.phase != Settled

pure def kindLimit(k: Kind): int = if (k == Blackboxes) 2 else 4

pure def activeOf(c: Compute, k: Kind): int =
  c.runs.select(r => r.kind == k and isActive(r)).length()

pure def settleFree(x: Run, result: Result): Run =
  { ...x, phase: Settled, result: result, seconds: 0, base: 0, fee: 0, charged: 0, returned: x.reserve }

pure def settledCharge(x: Run, seconds: int, metered: int): Run =
  val counted = if (seconds > x.minutes * 60) x.minutes * 60 else seconds
  val timed = quoteFor(hourlyBaseOf(x.spec), unitOf(x.spec), counted).base
  val spec = x.spec
  val measured = match spec {
    | Blackbox(_) => timed
    | DryDock(_) => if (metered < timed) metered else timed
  }
  val base = if (x.kind == Blackboxes and x.attestation != Verified) 0 else measured
  val fee = if (base == 0) 0 else 10000 + ceilDiv(base * 25, 100)
  val charged = base + fee
  { ...x, phase: Settled, seconds: counted, base: base, fee: fee, charged: charged, returned: x.reserve - charged }
```

```quint
pure val idValues = Set("run-1", "run-2", "run-3")
pure val referenceValues = Set("ref-a", "ref-b")
pure val walletValues = Set("wallet-a", "wallet-b", "wallet-c")
pure val specValues = Set(
  Blackbox({ image: "ghcr.io/owner/app@sha256:abc", port: 8080, machine: "tdx.small", disk: 20 }),
  DryDock({ repository: "https://github.com/owner/repo", revision: "0123456789abcdef0123456789abcdef01234567" }),
)
pure val minutesValues = Set(5, 15, 60)
pure val secondsValues = Set(0, 300, 900)
pure val meteredValues = Set(0, 1500, 9000)
pure val rValues = Set(
  { id: "run-1", reference: "ref-a", wallet: "wallet-a", kind: Blackboxes,
    spec: Blackbox({ image: "img", port: 8080, machine: "tdx.small", disk: 20 }),
    minutes: 15, reserve: quote(Blackbox({ image: "img", port: 8080, machine: "tdx.small", disk: 20 }), 15),
    phase: Teardown, result: Stopped, attestation: Verified, stopRequested: true,
    seconds: 0, base: 0, fee: 0, charged: 0, returned: 0 },
  { id: "run-2", reference: "ref-b", wallet: "wallet-b", kind: DryDocks,
    spec: DryDock({ repository: "repo", revision: "rev" }),
    minutes: 5, reserve: quote(DryDock({ repository: "repo", revision: "rev" }), 5),
    phase: Teardown, result: Completed, attestation: Absent, stopRequested: false,
    seconds: 0, base: 0, fee: 0, charged: 0, returned: 0 },
)
```

## Story: Rent a confidential machine

> As a wallet holder, I want to open a Blackbox or a Dry Dock for a rental
> window, follow it to running, and end it or let it expire, so that I only
> pay for compute I used.

### A wallet opens a run for a supported window and a valid workload

Opening records the run as `Queued` and reserves the maximum hold — the
quoted total for the whole window — against it. Repeating an open with a
reference the wallet has used returns the earlier run and changes nothing.

```quint
pure def canOpen(c: Compute, id: str, reference: str, wallet: str, spec: Workload, minutes: int): bool =
  id != "" and reference != "" and wallet != "" and
  validSpec(spec) and windowAllowed(spec, minutes) and
  not(c.runs.some(r => r.id == id)) and
  (c.runs.some(r => r.wallet == wallet and r.reference == reference) or
    (not(c.runs.some(r => r.wallet == wallet and isActive(r))) and
      activeOf(c, kindOf(spec)) < kindLimit(kindOf(spec))))

pure def open(c: Compute, id: str, reference: str, wallet: str, spec: Workload, minutes: int): Compute =
  if (not(canOpen(c, id, reference, wallet, spec, minutes))) c
  else if (c.runs.some(r => r.wallet == wallet and r.reference == reference)) c
  else { ...c, runs: c.runs.append({
    id: id, reference: reference, wallet: wallet, kind: kindOf(spec), spec: spec,
    minutes: minutes, reserve: quote(spec, minutes),
    phase: Queued, result: Ongoing, attestation:
      (match spec { | Blackbox(_) => Pending | DryDock(_) => Absent }),
    stopRequested: false, seconds: 0, base: 0, fee: 0, charged: 0, returned: 0 }) }
```

### A wallet can run one compute job at a time

The active compute run limit is one per wallet, and the pilot capacity
limit is two active Blackboxes and four active Dry Docks across all
wallets.

```quint
pure def alwaysOneActivePerWallet(c: Compute): bool =
  c.runs.every(r => c.runs.every(o =>
    not(isActive(r) and isActive(o) and r.wallet == o.wallet) or r == o))

pure def alwaysKindWithinCapacity(c: Compute): bool =
  activeOf(c, Blackboxes) <= 2 and activeOf(c, DryDocks) <= 4
```

### Run ids and a wallet's references are never reused

Every run keeps the id it was opened with and a second open with the same
wallet and reference finds the earlier run.

```quint
pure def alwaysIdsAreUnique(c: Compute): bool =
  c.runs.every(r => c.runs.every(o => (r.id != o.id) or (r == o)))

pure def lawOpenTwiceOpensOnce(c: Compute, id: str, reference: str, wallet: str, spec: Workload, minutes: int): bool =
  open(open(c, id, reference, wallet, spec, minutes), id, reference, wallet, spec, minutes) ==
    open(c, id, reference, wallet, spec, minutes)
```

### The provider launches a queued run

```quint
pure def canLaunch(c: Compute, id: str): bool =
  c.runs.some(r => r.id == id and r.phase == Queued)

pure def launch(c: Compute, id: str): Compute =
  if (not(canLaunch(c, id))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) { ...r, phase: Provisioning } else r) }
```

### A queued run that never launches settles for nothing

A stop requested before launch, or a launch that never comes, ends the run
`stopped` or `expired` and returns the whole hold.

```quint
pure def canAbandon(c: Compute, id: str, result: Result): bool =
  c.runs.some(r => r.id == id and r.phase == Queued and
    (result == Expired or (result == Stopped and r.stopRequested)))

pure def abandon(c: Compute, id: str, result: Result): Compute =
  if (not(canAbandon(c, id, result))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) settleFree(r, result) else r) }
```

### A provider that declines settles the run failed at no charge

The provider declining the configuration or the start ends the run
`failed` and returns the whole hold.

```quint
pure def canDecline(c: Compute, id: str): bool =
  c.runs.some(r => r.id == id and r.phase == Provisioning)

pure def decline(c: Compute, id: str): Compute =
  if (not(canDecline(c, id))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) settleFree(r, Failed) else r) }
```

### A Blackbox only serves inference once its attestation is verified

While a Blackbox provisions its attestation is `Pending`. Verified
evidence — a checked hardware quote and a matching compose measurement —
moves the run to `Running` and marks it `Verified`; only then does the
workload's public HTTPS endpoint exist.

```quint
pure def canAttest(c: Compute, id: str): bool =
  c.runs.some(r => r.id == id and r.phase == Provisioning and r.kind == Blackboxes and r.attestation == Pending)

pure def attest(c: Compute, id: str): Compute =
  if (not(canAttest(c, id))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) { ...r, phase: Running, attestation: Verified } else r) }
```

### A Blackbox that cannot be verified tears down failed

Evidence that never verifies marks the run `Rejected` and sends it to
teardown with a `failed` result; it is never billed.

```quint
pure def canReject(c: Compute, id: str): bool =
  c.runs.some(r => r.id == id and r.phase == Provisioning and r.kind == Blackboxes and r.attestation == Pending)

pure def reject(c: Compute, id: str): Compute =
  if (not(canReject(c, id))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) { ...r, attestation: Rejected, phase: Teardown, result: Failed } else r) }
```

### A Dry Dock runs once its build starts

```quint
pure def canWork(c: Compute, id: str): bool =
  c.runs.some(r => r.id == id and r.phase == Provisioning and r.kind == DryDocks)

pure def work(c: Compute, id: str): Compute =
  if (not(canWork(c, id))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) { ...r, phase: Running } else r) }
```

### A running or provisioning run can be asked to stop

A stop is only a request: it marks the run, and teardown or settlement
ends it `stopped`.

```quint
pure def canStop(c: Compute, id: str): bool =
  c.runs.some(r => r.id == id and not(r.stopRequested) and
    (r.phase == Queued or r.phase == Provisioning or r.phase == Running))

pure def stop(c: Compute, id: str): Compute =
  if (not(canStop(c, id))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) { ...r, stopRequested: true } else r) }
```

### A provisioning or running run enters teardown with its outcome

A requested stop ends it `stopped`, the end of its window `expired`, a
machine that fails or is removed `failed`, and a Dry Dock build that
finishes `completed` — a Blackbox never completes.

```quint
pure def canTearDown(c: Compute, id: str, result: Result): bool =
  c.runs.some(r => r.id == id and (r.phase == Provisioning or r.phase == Running) and
    (result == Failed or result == Expired or (result == Stopped and r.stopRequested) or
      (result == Completed and r.kind == DryDocks)))

pure def tearDown(c: Compute, id: str, result: Result): Compute =
  if (not(canTearDown(c, id, result))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) { ...r, phase: Teardown, result: result } else r) }
```

### Teardown settles the hold against metered time

Counted seconds are capped at the window. A Blackbox bills its timed base
unless it never verified, when it bills nothing; a Dry Dock bills the
provider's metered base, capped by the timed base. The fee applies
whenever a run was billed, and what is not charged returns to the wallet.

```quint
pure def canSettleRun(c: Compute, id: str, seconds: int, metered: int): bool =
  seconds >= 0 and metered >= 0 and c.runs.some(r => r.id == id and r.phase == Teardown)

pure def settleRun(c: Compute, id: str, seconds: int, metered: int): Compute =
  if (not(canSettleRun(c, id, seconds, metered))) c
  else { ...c, runs: c.runs.listMap(r => if (r.id == id) settledCharge(r, seconds, metered) else r) }
```

### A run's phase only moves forward along the lifecycle edges

```quint
pure def edgeOk(from: Phase, into: Phase): bool =
  from == into or
  (from == Queued and (into == Provisioning or into == Settled)) or
  (from == Provisioning and (into == Running or into == Teardown or into == Settled)) or
  (from == Running and into == Teardown) or
  (from == Teardown and into == Settled)

pure def stepRunsOnlyMoveForward(before: Compute, after: Compute): bool =
  before.runs.every(rb => after.runs.every(ra =>
    (ra.id != rb.id) or edgeOk(rb.phase, ra.phase)))
```

### A settled run is never resurrected

Once settled, a run keeps exactly the record it settled with.

```quint
pure def stepSettledStays(before: Compute, after: Compute): bool =
  before.runs.every(r => r.phase != Settled or after.runs.includes(r))
```

### A run's result is set exactly when it heads to settlement

```quint
pure def alwaysResultFollowsPhase(c: Compute): bool =
  c.runs.every(r => (r.phase == Teardown or r.phase == Settled) == (r.result != Ongoing))
```

### A run's kind is its workload's kind

```quint
pure def alwaysKindMatchesSpec(c: Compute): bool =
  c.runs.every(r => r.kind == kindOf(r.spec))
```

### A running Blackbox is always verified, and a Dry Dock never needs evidence

```quint
pure def alwaysVerifiedToServe(c: Compute): bool =
  c.runs.every(r => r.kind != Blackboxes or r.phase != Running or r.attestation == Verified)

pure def alwaysDocksUnattested(c: Compute): bool =
  c.runs.every(r => r.kind != DryDocks or r.attestation == Absent)
```

### A run's reserve is the quote of its spec

Discovered by the proof: a settled run is billed from its workload's own
quote, so the charge stays inside the hold only when every hold was the
quote of its workload and window — which `open` wrote and no later step
touches.

```quint
pure def alwaysReserveIsQuoted(c: Compute): bool =
  c.runs.every(r => r.reserve == quote(r.spec, r.minutes))
```

### A charge never exceeds the hold, and the hold is charge plus what returned

```quint
pure def alwaysChargesAreConserved(c: Compute): bool =
  c.runs.every(r =>
    r.charged >= 0 and r.charged <= r.reserve and
    (r.phase == Settled or r.charged == 0) and
    (r.phase != Settled or (r.charged + r.returned == r.reserve and r.returned >= 0)))
```

### A Blackbox that never verified is never billed

```quint
pure def alwaysUnverifiedIsFree(c: Compute): bool =
  c.runs.every(r => r.kind != Blackboxes or r.attestation == Verified or r.charged == 0)
```

### Metered time beyond the window is never charged

```quint
pure def lawReserveCoversCharge(r: Run, seconds: int, metered: int): bool =
  seconds < 0 or metered < 0 or r.reserve != quote(r.spec, r.minutes) or
    settledCharge(r, seconds, metered).charged <= r.reserve
```

### A run that counts nothing is billed nothing

```quint
pure def lawZeroSecondsIsFree(rate: int, unit: int): bool =
  unit <= 0 or rate < 0 or (quoteFor(rate, unit, 0).base == 0 and quoteFor(rate, unit, 0).total == 0)
```

### Every run settles in the end

The provider's work — launching, attesting, building, tearing down and
settling — is fair: a run left in any phase before settled is carried the
rest of the way.

```quint
pure def leadsToAllSettled(before: Compute, later: Compute): bool =
  before.runs.every(rb => later.runs.some(ra => ra.id == rb.id and ra.phase == Settled))

pure val fair_launch = "weak"
pure val fair_abandon = "weak"
pure val fair_decline = "weak"
pure val fair_attest = "weak"
pure val fair_reject = "weak"
pure val fair_work = "weak"
pure val fair_tearDown = "weak"
pure val fair_settleRun = "weak"
```

### A run can reach running, be verified, settle completed or stop early, and evidence can be rejected

```quint
pure def sometimesRunning(c: Compute): bool = c.runs.some(r => r.phase == Running)

pure def sometimesVerified(c: Compute): bool = c.runs.some(r => r.attestation == Verified)

pure def sometimesSettled(c: Compute): bool =
  c.runs.some(r => r.phase == Settled and r.result == Completed)

pure def sometimesStoppedEarly(c: Compute): bool =
  c.runs.some(r => r.phase == Settled and r.result == Stopped)

pure def sometimesRejected(c: Compute): bool = c.runs.some(r => r.attestation == Rejected)

pure val eval_witness_sometimesRunning = (
  ("open", "run-1", "ref-a", "wallet-a", Blackbox({ image: "ghcr.io/owner/app@sha256:abc", port: 8080, machine: "tdx.small", disk: 20 }), 15),
  ("launch", "run-1"),
  ("attest", "run-1"))
pure val eval_witness_sometimesSettled = (
  ("open", "run-1", "ref-a", "wallet-a", DryDock({ repository: "https://github.com/owner/repo", revision: "0123456789abcdef0123456789abcdef01234567" }), 5),
  ("launch", "run-1"),
  ("work", "run-1"),
  ("tearDown", "run-1", Completed),
  ("settleRun", "run-1", 30, 60))
pure val eval_witness_sometimesStoppedEarly = (
  ("open", "run-1", "ref-a", "wallet-a", Blackbox({ image: "ghcr.io/owner/app@sha256:abc", port: 8080, machine: "tdx.small", disk: 20 }), 15),
  ("launch", "run-1"),
  ("stop", "run-1"),
  ("tearDown", "run-1", Stopped),
  ("settleRun", "run-1", 0, 0))
pure val eval_witness_sometimesRejected = (
  ("open", "run-1", "ref-a", "wallet-a", Blackbox({ image: "ghcr.io/owner/app@sha256:abc", port: 8080, machine: "tdx.small", disk: 20 }), 15),
  ("launch", "run-1"),
  ("reject", "run-1"))
```
