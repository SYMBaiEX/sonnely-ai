# Site

The public pages and what is on them: home, the product pages, the journal,
status, privacy, terms, verify and contact. Most of the site is prose; the
status board is the one thing on it that has a life cycle: the app probes
its dependencies and reports what it finds, and the board shows the latest
report.

## Domain

### A probe watches one dependency

Each provider route is probed; a probe is `Pending` until its first answer,
then `Ok` or `Down`, or `Disabled` when the provider is not configured.

```quint
type ProbeState = Pending | Ok | Down | Disabled

type Probe = { provider: str, label: str, state: ProbeState }
```

### A report is one health check

The fixed checks — the account service, mainnet USDC payments and deposit
recovery — are flags; inference routing is the probes.

```quint
type Report = { accountUp: bool, mainnetUp: bool, recoveryUp: bool, probes: List[Probe] }
```

### The board waits for its first report, then shows the latest

```quint
type Board = Waiting | Live({ report: Report })

pure val initial: Board = Waiting
```

## Story: Check the service status

> As a visitor, I want to see whether the gateway and its providers are up,
> so that I know whether a problem is mine or the service's.

### A report counts only when every probe names what it watches

```quint
pure def wellFormed(r: Report): bool = r.probes.every(p => p.provider != "" and p.label != "")

pure def canReport(b: Board, found: Report): bool = wellFormed(found)

pure def report(b: Board, found: Report): Board = Live({ report: found })
```

### The board only ever waits or stands on a report

```quint
pure def stepOnlyALiveReportStands(before: Board, via: str, after: Board): bool =
  after == before or (match after { | Live(x) => true | Waiting => false })
```

### Routing is up when every configured probe is ok or disabled

```quint
pure def routingUp(r: Report): bool = r.probes.every(p => p.state == Ok or p.state == Disabled)
```

### The board is healthy only when every check is up

```quint
type Overall = Healthy | Degraded

pure def overall(r: Report): Overall =
  if (r.accountUp and r.mainnetUp and r.recoveryUp and routingUp(r)) Healthy else Degraded

pure def lawHealthyNeedsEveryCheck(found: Report): bool =
  (overall(found) == Healthy) implies (found.accountUp and found.mainnetUp and found.recoveryUp and routingUp(found))
```

### A report can come in

```quint
pure def sometimesLive(b: Board): bool = b != Waiting
```

```quint
pure val foundValues = Set(
  {
    accountUp: true, mainnetUp: true, recoveryUp: true,
    probes: List({ provider: "near-ai", label: "NEAR AI", state: Ok }),
  },
  {
    accountUp: true, mainnetUp: false, recoveryUp: true,
    probes: List({ provider: "phala", label: "Phala", state: Down }),
  },
  {
    accountUp: true, mainnetUp: true, recoveryUp: true,
    probes: List({ provider: "tinfoil", label: "", state: Pending }),
  },
)
```
