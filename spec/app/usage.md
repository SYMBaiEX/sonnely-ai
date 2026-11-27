# Usage

Every inference request is metered as a row the Usage console rolls up: the
request's model, provider, key, tokens, cost and status. A request is
`Pending` while its cost is reserved, then `Complete` when charged,
`Failed` when released, or `Unreported` when it went under review. Statuses
match the request log: `pending`, `complete`, `failed`, `unreported`.

## Domain

### A metered request

`cached` and `providerMs` are `-1` when the provider did not measure them.
`keyId` is `""` for requests not made through a key (the console itself).
`project` is the team project the key belongs to, or `""` for workspace use.
Cost is micro-USD.

```quint
type Status = Pending | Complete | Failed | Unreported

type Provider = NearAI | Phala | Tinfoil

type Row = {
  id: str,
  time: int,
  keyName: str,
  keyId: str,
  project: str,
  wallet: str,
  model: str,
  provider: Provider,
  input: int,
  output: int,
  cached: int,
  cost: int,
  providerMs: int,
  status: Status,
}

type Usage = { rows: List[Row] }
```

### The meter starts empty

```quint
pure val initial: Usage = { rows: List() }
```

```quint
pure def rowWithId(u: Usage, id: str): List[Row] = u.rows.select(r => r.id == id)

pure def ownedRowWithId(u: Usage, id: str, wallet: str): List[Row] =
  u.rows.select(r => r.id == id and r.wallet == wallet)

pure val byValues = Set("w1", "w2")
pure val idValues = Set("r1", "r2", "r3")
pure val timeValues = Set(0, 86400000, 172800000)
pure val keyNameValues = Set("CI key", "Console")
pure val keyIdValues = Set("", "k1")
pure val projectValues = Set("", "p1")
pure val modelValues = Set("deepseek-ai/DeepSeek-V4.1", "openai/gpt-5.2")
pure val inputValues = Set(0, 100, 500)
pure val outputValues = Set(0, 50, 300)
pure val cachedValues = Set(-1, 0, 100)
pure val costValues = Set(0, 1, 120000)
pure val providerMsValues = Set(-1, 0, 500, 2500)
pure val providerValues = Set(NearAI, Phala, Tinfoil)
pure val statusValues = Set(Pending, Complete, Failed, Unreported)
pure val sinceValues = Set(0, 86400000)
pure val rowsValues = Set(List()).union(Set(List(
  { id: "r1", time: 1000, keyName: "CI key", keyId: "k1", project: "p1", wallet: "w1", model: "deepseek-ai/DeepSeek-V4.1", provider: NearAI,
    input: 10, output: 5, cached: 3, cost: 100, providerMs: 40, status: Complete },
  { id: "r2", time: 2000, keyName: "Console", keyId: "", project: "", wallet: "w1", model: "openai/gpt-5.2", provider: Phala,
    input: 0, output: 0, cached: -1, cost: 50, providerMs: -1, status: Pending })))
```

## Story: Meter a request

> As the gateway, I want to record each request's reserved cost when it
> starts and its tokens and final outcome when it ends, so that the ledger
> shows what was charged, released or held.

### A request is recorded with a reserved cost

Each request id is unique; the reserved cost is nonnegative.

```quint
pure def canRecord(u: Usage, by: str, id: str, time: int, keyName: str, keyId: str, project: str, model: str, provider: Provider, cost: int): bool =
  by != "" and id != "" and keyName != "" and model != "" and cost >= 0 and time >= 0
  and u.rows.every(r => r.id != id)

pure def record(u: Usage, by: str, id: str, time: int, keyName: str, keyId: str, project: str, model: str, provider: Provider, cost: int): Usage =
  { rows: u.rows.append({
      id: id, time: time, keyName: keyName, keyId: keyId, project: project, wallet: by, model: model, provider: provider,
      input: 0, output: 0, cached: -1, cost: cost, providerMs: -1, status: Pending }) }
```

### A pending request settles with its real usage

Charging records the input and output tokens, the final charge and the
provider's measurements; a cached token count never exceeds the input.

```quint
pure def canCharge(u: Usage, by: str, id: str, input: int, output: int, cached: int, cost: int, providerMs: int): bool =
  ownedRowWithId(u, id, by).some(r => r.status == Pending)
  and input >= 0 and output >= 0 and cost >= 0
  and cached >= -1 and cached <= input and providerMs >= -1

pure def charge(u: Usage, by: str, id: str, input: int, output: int, cached: int, cost: int, providerMs: int): Usage =
  { rows: u.rows.listMap(r =>
      if (r.id == id and r.wallet == by) { ...r, input: input, output: output, cached: cached, cost: cost, providerMs: providerMs, status: Complete }
      else r) }
```

### A pending request can fail or go under review

A stream that dies after serving part of its answer never reports its usage:
the row goes under review with what the shell estimated it served — tokens
and the charge actually captured, never more than the reserve. Bytes are not
tokens: the shell estimates both input and output at four characters per
token, the conservative factor it uses everywhere it must estimate, so the
row never presents a byte count as measured tokens.

```quint
pure def canRelease(u: Usage, by: str, id: str): bool = ownedRowWithId(u, id, by).some(r => r.status == Pending)

pure def release(u: Usage, by: str, id: str): Usage =
  { rows: u.rows.listMap(r => if (r.id == id and r.wallet == by) { ...r, status: Failed } else r) }

pure def canUnreported(u: Usage, by: str, id: str, input: int, output: int, cost: int): bool =
  ownedRowWithId(u, id, by).some(r => r.status == Pending and input >= 0 and output >= 0 and cost >= 0 and cost <= r.cost)

pure def unreported(u: Usage, by: str, id: str, input: int, output: int, cost: int): Usage =
  { rows: u.rows.listMap(r => if (r.id == id and r.wallet == by) { ...r, input: input, output: output, cost: cost, status: Unreported } else r) }
```

### Every usage row belongs to the wallet that metered it

The wallet is part of the row, and the trusted sender of record and settlement
events must be that wallet. The API derives the sender from the verified
session or from the already authenticated key owner inside the gateway; it
never trusts a wallet supplied by the client. Reads project rows for the
session wallet.

```quint
pure def stepWalletNeverChanges(before: Usage, after: Usage): bool =
  before.rows.every(r => rowWithId(after, r.id).every(a => a.wallet == r.wallet))
```

### A pending row carries no measurements yet

```quint
pure def alwaysPendingIsClean(u: Usage): bool =
  u.rows.every(r =>
    r.status != Pending
    or (r.input == 0 and r.output == 0 and r.cached == -1 and r.providerMs == -1))
```

### Every row is well formed and uniquely identified

```quint
pure def alwaysRowsAreWellFormed(u: Usage): bool =
  u.rows.every(r =>
    r.id != "" and r.wallet != "" and r.keyName != "" and r.model != "" and r.time >= 0
    and r.input >= 0 and r.output >= 0 and r.cost >= 0
    and r.cached >= -1 and r.cached <= r.input and r.providerMs >= -1)
  and u.rows.every(r => u.rows.select(o => o.id == r.id).length() == 1)
```

### Rows are never removed and settled rows never change

```quint
pure def stepRowsOnlyGrow(before: Usage, after: Usage): bool =
  before.rows.every(r => rowWithId(after, r.id).length() == 1)

pure def stepSettledRowsAreFixed(before: Usage, after: Usage): bool =
  before.rows.every(r =>
    r.status == Pending or rowWithId(after, r.id).every(a => a == r))
```

### A pending row can only settle, fail or go under review

```quint
pure def stepPendingSettles(before: Usage, after: Usage): bool =
  before.rows.every(r =>
    r.status != Pending
    or rowWithId(after, r.id).every(a =>
      a == r or (a.status != Pending and a.id == r.id and a.time == r.time and a.keyName == r.keyName
                 and a.keyId == r.keyId and a.project == r.project and a.wallet == r.wallet and a.model == r.model and a.provider == r.provider)))
```

### A request can complete and one can be held

```quint
pure def sometimesCompleted(u: Usage): bool = u.rows.some(r => r.status == Complete)

pure def sometimesHeld(u: Usage): bool = u.rows.some(r => r.status == Pending or r.status == Unreported)
```

## Story: Roll usage up

> As a workspace member, I want totals, per-day series and breakdowns by
> model, provider and key over a date range, so that I can see where spend
> goes and export it.

### Totals are the sum of their rows

Spend counts only completed requests; held counts pending and unreported
reservations; cached input counts only rows that reported it.

```quint
type Totals = { requests: int, complete: int, failed: int, input: int, output: int, spend: int, held: int, cached: int, cacheSamples: int }

pure def totals(rows: List[Row]): Totals =
  rows.foldl({ requests: 0, complete: 0, failed: 0, input: 0, output: 0, spend: 0, held: 0, cached: 0, cacheSamples: 0 },
    (t, r) => {
      requests: t.requests + 1,
      complete: t.complete + (if (r.status == Complete) 1 else 0),
      failed: t.failed + (if (r.status == Failed) 1 else 0),
      input: t.input + r.input,
      output: t.output + r.output,
      spend: t.spend + (if (r.status == Complete) r.cost else 0),
      held: t.held + (if (r.status == Pending or r.status == Unreported) r.cost else 0),
      cached: t.cached + (if (r.cached >= 0) r.cached else 0),
      cacheSamples: t.cacheSamples + (if (r.cached >= 0) 1 else 0),
    })

pure def completeCost(rows: List[Row]): int =
  rows.foldl(0, (total, r) => if (r.status == Complete) total + r.cost else total)

pure def heldCost(rows: List[Row]): int =
  rows.foldl(0, (total, r) => if (r.status == Pending or r.status == Unreported) total + r.cost else total)

pure def lawSpendIsCompleteCost(rows: List[Row]): bool = totals(rows).spend == completeCost(rows)

pure def lawHeldIsUnresolvedCost(rows: List[Row]): bool = totals(rows).held == heldCost(rows)

pure def lawRequestsCountRows(rows: List[Row]): bool = totals(rows).requests == rows.length()
```

### Period filters keep only what is inside the window

```quint
pure def within(rows: List[Row], since: int): List[Row] = rows.select(r => r.time >= since)

pure def byKey(rows: List[Row], keyId: str): List[Row] = rows.select(r => r.keyId == keyId)

pure def byModel(rows: List[Row], model: str): List[Row] = rows.select(r => r.model == model)

pure def byProvider(rows: List[Row], provider: Provider): List[Row] = rows.select(r => r.provider == provider)

pure def byStatus(rows: List[Row], status: Status): List[Row] = rows.select(r => r.status == status)

pure def lawWithinKeepsRecent(rows: List[Row], since: int): bool =
  within(rows, since).every(r => r.time >= since)

pure def lawFiltersKeepMatches(rows: List[Row], keyId: str, model: str, provider: Provider, status: Status): bool =
  byKey(rows, keyId).every(r => r.keyId == keyId)
  and byModel(rows, model).every(r => r.model == model)
  and byProvider(rows, provider).every(r => r.provider == provider)
  and byStatus(rows, status).every(r => r.status == status)
```
