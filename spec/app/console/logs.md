# Logs

The workspace's request history: each inference request the gateway served,
most recently recorded first, and the filters the Request logs page queries
it by. On staging there is no real gateway traffic: a completed playground
reply records a row, and the workspace opens with a small sample history so
the page has something to show.

## Domain

### A request row records what ran, how it ended and what it cost

`ageDays` is how many days ago the request ran; 0 is today. `input`,
`output` and `durationMs` are tokens and milliseconds; `cost` is micro-USD.

```quint
type LogStatus = Pending | Complete | Failed | Unreported

type LogEntry = {
  id: str,
  model: str,
  provider: str,
  endpoint: str,
  keyName: str,
  status: LogStatus,
  input: int,
  output: int,
  cost: int,
  durationMs: int,
  ageDays: int,
}
```

### The page filters by age, provider, status and exact model or key

An empty provider, model or key filter matches everything; `AllTime` does
not bound the age.

```quint
type Window = Week | Month | Quarter | AllTime

type StatusFilter = AnyStatus | One({ status: LogStatus })

type Logs = {
  entries: List[LogEntry],
  window: Window,
  provider: str,
  model: str,
  keyName: str,
  showing: StatusFilter,
}
```

```quint
pure def windowDays(r: Window): int = match r { | Week => 7 | Month => 30 | Quarter => 90 | AllTime => -1 }
```

### The workspace opens with a sample history

```quint
pure val initial: Logs = {
  entries: List(
    { id: "req-4f8c2a1b9d0e6f5a2b3c", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", provider: "near-ai", endpoint: "chat/completions", keyName: "playground", status: Complete, input: 812, output: 348, cost: 684, durationMs: 3210, ageDays: 0 },
    { id: "req-77aa10bc9d2f4e6a8c0d", model: "z-ai/glm-5.3-flash", provider: "near-ai", endpoint: "chat/completions", keyName: "playground", status: Complete, input: 156, output: 92, cost: 102, durationMs: 1180, ageDays: 1 },
    { id: "req-1b2c3d4e5f6a7b8c9d0e", model: "Qwen/Qwen3.6-35B-A3B-FP8", provider: "near-ai", endpoint: "batch/chat", keyName: "playground", status: Failed, input: 40, output: 0, cost: 0, durationMs: 640, ageDays: 3 },
  ),
  window: Week,
  provider: "",
  model: "",
  keyName: "",
  showing: AnyStatus,
}
```

### What the page shows is the history the filters pass

```quint
pure def statusShown(f: StatusFilter, s: LogStatus): bool =
  match f { | AnyStatus => true | One(x) => s == x.status }

pure def matches(l: Logs, e: LogEntry): bool =
  (windowDays(l.window) < 0 or e.ageDays <= windowDays(l.window)) and
  (l.provider == "" or e.provider == l.provider) and
  (l.model == "" or e.model == l.model) and
  (l.keyName == "" or e.keyName == l.keyName) and
  statusShown(l.showing, e.status)

pure def visible(l: Logs): List[LogEntry] = l.entries.select((e) => matches(l, e))
```

## Story: Review request activity

> As a workspace owner, I want to see the requests my workspace ran and
> narrow them down, so that I can audit routing, timing and charges.

### Served requests are recorded newest first

A row is recorded once, under its own request id.

```quint
pure def canRecord(l: Logs, entry: LogEntry): bool =
  entry.id != "" and entry.ageDays >= 0 and
    l.entries.select((x) => x.id == entry.id).length() == 0

pure def record(l: Logs, entry: LogEntry): Logs =
  { ...l, entries: List(entry).concat(l.entries) }
```

### Each filter can be set on its own

```quint
pure def setWindow(l: Logs, window: Window): Logs = { ...l, window: window }

pure def setProvider(l: Logs, provider: str): Logs = { ...l, provider: provider }

pure def setModel(l: Logs, model: str): Logs = { ...l, model: model }

pure def setKeyName(l: Logs, keyName: str): Logs = { ...l, keyName: keyName }

pure def setShowing(l: Logs, showing: StatusFilter): Logs = { ...l, showing: showing }
```

### The filters can be reset together

```quint
pure def canResetFilters(l: Logs): bool =
  l.window != Week or l.provider != "" or l.model != "" or l.keyName != "" or l.showing != AnyStatus

pure def resetFilters(l: Logs): Logs =
  { entries: l.entries, window: Week, provider: "", model: "", keyName: "", showing: AnyStatus }
```

### Request ids are never repeated

```quint
pure def alwaysRequestIdsUnique(l: Logs): bool =
  l.entries.every((e) => l.entries.select((x) => x.id == e.id).length() == 1)
```

### History never loses a recorded row

```quint
pure def stepNeverLosesHistory(before: Logs, via: str, after: Logs): bool =
  before.entries.length() <= after.entries.length()
```

### The filtered list only ever shows rows that pass every filter

```quint
pure def lawVisibleOnlyMatching(l: Logs): bool =
  visible(l).every((e) => matches(l, e))
```

### A row can be recorded

```quint
pure def sometimesRecorded(l: Logs): bool = l.entries.length() > 3
```

### A filter can rule everything out

```quint
pure def sometimesNoMatches(l: Logs): bool = l.entries.length() > 0 and visible(l).length() == 0
```

```quint
pure val entryValues = Set(
  { id: "req-new", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017", provider: "near-ai", endpoint: "chat/completions", keyName: "playground", status: Complete, input: 10, output: 20, cost: 30, durationMs: 400, ageDays: 0 },
  { id: "req-4f8c2a1b9d0e6f5a2b3c", model: "z-ai/glm-5.3-flash", provider: "phala", endpoint: "chat/completions", keyName: "ci", status: Failed, input: 5, output: 0, cost: 0, durationMs: 200, ageDays: 40 },
  { id: "req-stream", model: "Qwen/Qwen3.6-35B-A3B-FP8", provider: "tinfoil", endpoint: "responses", keyName: "agent", status: Pending, input: 0, output: 0, cost: 0, durationMs: 0, ageDays: 2 },
)

pure val windowValues = Set(Week, Month, Quarter, AllTime)

pure val showingValues = Set(AnyStatus, One({ status: Complete }), One({ status: Failed }))

pure val providerValues = Set("", "near-ai", "phala", "tinfoil")

pure val modelValues = Set("", "deepseek-ai/DeepSeek-V4.1-Flash-1017", "unknown/model")

pure val keyNameValues = Set("", "playground", "ci")
```
