# Batch jobs

A batch is a resumable, client-owned list of chat rows. The console uploads
a JSONL file of non-streaming chat requests, keeps the job on the device per
wallet, and sends one row at a time to `/api/sonnely/batch/chat` with the
job's checkpoint `Idempotency-Key` (`batch:<job id>:<row index>`) and the
workspace wallet. A row sent twice asks for review rather than a second
charge.

## Domain

### A batch job and its rows

One job per wallet at a time. Each row is identified by its `custom_id` from
the input file and moves through `Queued`, `Sending`, `Interrupted`, then
one of the terminal verdicts `Succeeded`, `Failed`, `Blocked` or `Review`.
`Blocked` is a workspace refusal (sign-in, budget or limit); `Review` means
the gateway may already hold the request and its settlement must be checked
before resending. `inFlight` remembers the one row being sent.

```quint
type RowStatus = Queued | Sending | Interrupted | Succeeded | Failed | Blocked | Review

type BatchRow = { customId: str, status: RowStatus }

type Job = { id: str, filename: str, createdAt: int, lastSentAt: int, inFlight: str, rows: List[BatchRow] }

type Batch = Empty | Running({ job: Job })

pure val initial: Batch = Empty

pure def terminal(s: RowStatus): bool =
  s == Succeeded or s == Failed or s == Blocked or s == Review

pure def jobId(b: Batch): str =
  match b { | Empty => "" | Running(j) => j.job.id }

pure def rows(b: Batch): List[BatchRow] =
  match b { | Empty => List() | Running(j) => j.job.rows }

pure def inFlight(b: Batch): str =
  match b { | Empty => "" | Running(j) => j.job.inFlight }

```

### Values the checks sample

```quint
pure val idValues = Set("batch_alpha", "batch_beta")

pure val filenameValues = Set("jobs.jsonl", "nightly.jsonl")

pure val customIdValues = Set("row-1", "row-2", "row-3")

pure val customIdsValues = Set(List("row-1"), List("row-1", "row-2"), List("row-1", "row-1"), List())

pure val createdAtValues = Set(0, 1, 5000)

pure val atValues = Set(0, 1, 6000)

pure val verdictValues = Set(Succeeded, Failed, Blocked, Review)
```

## Story: Run a resumable batch

> As a workspace member, I want to upload a list of chat requests and send
> them one at a time, so that a batch survives a closed tab and a repeated
> row is never sent twice.

### A new batch starts all of its rows queued

Creating replaces whatever was stored only under a different job id — a job
in progress is cleared first, never silently overwritten under the same id.
A `custom_id` repeated in the file keeps its first row, and an empty
`custom_id` is refused.

```quint
pure def canCreate(b: Batch, id: str, customIds: List[str]): bool =
  jobId(b) != id and customIds.length() >= 1 and customIds.length() <= 200 and
  customIds.every((c) => c != "")

pure def create(b: Batch, id: str, filename: str, customIds: List[str], createdAt: int): Batch =
  val rs = customIds.foldl(
    List(),
    (acc, c) => if (acc.some((r) => r.customId == c)) acc else acc.concat(List({ customId: c, status: Queued }))
  )
  Running({ job: {
    id: id,
    filename: filename,
    createdAt: createdAt,
    lastSentAt: -1,
    inFlight: "",
    rows: rs
  } })
```

### Rows are sent one at a time

A queued or interrupted row may be sent next; nothing else may be in flight.

```quint
pure def canBegin(b: Batch, customId: str, at: int): bool =
  at >= 0 and
  inFlight(b) == "" and
  rows(b).some((r) => r.customId == customId and (r.status == Queued or r.status == Interrupted))

pure def begin(b: Batch, customId: str, at: int): Batch =
  match b {
  | Empty => b
  | Running(j) =>
      Running({ job: { ...j.job, inFlight: customId, lastSentAt: at, rows: j.job.rows.listMap((r) => if (r.customId == customId) { ...r, status: Sending } else r) } })
  }
```

### A sent row reaches a terminal verdict

```quint
pure def canResolve(b: Batch, customId: str, verdict: RowStatus): bool =
  terminal(verdict) and
  inFlight(b) == customId and
  rows(b).some((r) => r.customId == customId and r.status == Sending)

pure def resolve(b: Batch, customId: str, verdict: RowStatus): Batch =
  match b {
  | Empty => b
  | Running(j) => Running({ job: { ...j.job, inFlight: "", rows: j.job.rows.listMap((r) => if (r.customId == customId) { ...r, status: verdict } else r) } })
  }
```

### A row in flight can be interrupted and sent again

A dropped connection or a closed tab leaves the row `Interrupted`, not
charged and resumable.

```quint
pure def canInterrupt(b: Batch, customId: str): bool =
  inFlight(b) == customId and
  rows(b).some((r) => r.customId == customId and r.status == Sending)

pure def interrupt(b: Batch, customId: str): Batch =
  match b {
  | Empty => b
  | Running(j) => Running({ job: { ...j.job, inFlight: "", rows: j.job.rows.listMap((r) => if (r.customId == customId) { ...r, status: Interrupted } else r) } })
  }
```

### Clearing removes the stored job

```quint
pure def canClear(b: Batch): bool = b != Empty

pure def clear(b: Batch): Batch = Empty
```

### A job holds between one and two hundred rows

```quint
pure def alwaysBoundedRows(b: Batch): bool =
  match b { | Empty => true | Running(j) => j.job.rows.length() >= 1 and j.job.rows.length() <= 200 }
```

### No row carries an empty custom_id

```quint
pure def alwaysNonemptyIds(b: Batch): bool =
  match b { | Empty => true | Running(j) => j.job.rows.every((r) => r.customId != "") }
```

### Every custom_id in a job is unique

Two rows that carry the same `custom_id` carry the same status — a
`custom_id` names exactly one row.

```quint
pure def alwaysUniqueCustomIds(b: Batch): bool =
  rows(b).every((x) => rows(b).every((y) => x.customId != y.customId or x.status == y.status))
```

### The remembered row is the only one in flight

A row is `Sending` exactly when it is the remembered in-flight row, and
`inFlight` is empty exactly when no row is being sent.

```quint
pure def alwaysSingleFlight(b: Batch): bool =
  match b {
  | Empty => true
  | Running(j) =>
      j.job.rows.every((r) => (r.status == Sending) iff (j.job.inFlight != "" and r.customId == j.job.inFlight))
  }
```

### A terminal row never moves

While the same job stays open, a row that reached `Succeeded`, `Failed`,
`Blocked` or `Review` keeps its verdict — it is never sent again.

```quint
pure def stepTerminalRowsStay(before: Batch, after: Batch): bool =
  match before {
  | Empty => true
  | Running(j) => match after {
    | Empty => true
    | Running(k) =>
      k.job.id != j.job.id or
      j.job.rows.every((x) => k.job.rows.every((y) => y.customId != x.customId or not(terminal(x.status)) or y.status == x.status))
    }
  }
```

### Rows are never added to or removed from an open job

While the same job stays open it keeps its rows, one `custom_id` apiece;
only row statuses change.

```quint
pure def stepRowsAreStable(before: Batch, after: Batch): bool =
  match before {
  | Empty => true
  | Running(j) => match after {
    | Empty => true
    | Running(k) =>
      k.job.id != j.job.id or
      (j.job.rows.length() == k.job.rows.length() and
       j.job.rows.every((x) => k.job.rows.some((y) => y.customId == x.customId)))
    }
  }
```

### An interrupted row can be sent again

```quint
pure def lawInterruptedResends(b: Batch, customId: str, at: int): bool =
  at < 0 or
  not(rows(b).some((r) => r.customId == customId and r.status == Interrupted) and inFlight(b) == "") or
  canBegin(b, customId, at)
```

### Every row of a batch can settle

```quint
pure def sometimesAllSettled(b: Batch): bool =
  match b { | Empty => false | Running(j) => j.job.rows.every((r) => terminal(r.status)) }
```

### A row can be interrupted

```quint
pure def sometimesInterrupted(b: Batch): bool =
  rows(b).some((r) => r.status == Interrupted)
```

### A row can land in review

```quint
pure def sometimesReview(b: Batch): bool =
  rows(b).some((r) => r.status == Review)
```
