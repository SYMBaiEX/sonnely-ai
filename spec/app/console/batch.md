# Batch

A JSONL file of nonstreaming chat requests the console prepares on the page
and runs one row at a time, checkpointing each row as it settles. A
workspace keeps at most one batch at a time: submit, run, settle — with the
attention states the real gateway produces (blocked on credits,
interrupted, under review). The batch belongs to the device that submitted
it; clearing it starts over.

## Domain

### A batch is idle, or a working job of named rows

Each row carries the custom id the file gave it, the model it targets, how
it ended up and a short detail from the runner.

```quint
type RowStatus = Queued | Sending | Succeeded | Failed | Blocked | Interrupted | Review

type BatchRow = { customId: str, model: str, status: RowStatus, detail: str }

type BatchRequest = { customId: str, model: str }

type Batch = Idle | Working({ id: str, filename: str, rows: List[BatchRow] })
```

```quint
pure def rows(b: Batch): List[BatchRow] = match b { | Idle => List() | Working(w) => w.rows }

pure def sending(b: Batch): int = rows(b).select((r) => r.status == Sending).length()

pure def rowAt(b: Batch, index: int): BatchRow =
  rows(b).nthOr(index, { customId: "", model: "", status: Queued, detail: "" })

type RowAcc = { out: List[BatchRow], i: int }

pure def setStatusAt(rs: List[BatchRow], index: int, status: RowStatus, detail: str): List[BatchRow] =
  rs.foldl({ out: List(), i: 0 }, (acc, r) =>
    if (acc.i == index) { out: acc.out.concat(List({ ...r, status: status, detail: detail })), i: acc.i + 1 }
    else { out: acc.out.concat(List(r)), i: acc.i + 1 }).out
```

### The page starts with no batch

```quint
pure val initial: Batch = Idle
```

## Story: Prepare and run a batch

> As a workspace owner, I want to hand a file of chat requests to the
> gateway and watch each row settle, so that I can process offline
> workloads without my own queue.

### Submitting a file opens a batch of queued rows

Only an idle workspace takes a file; every row needs a unique, nonempty
custom id.

```quint
pure def canSubmit(b: Batch, id: str, filename: str, requests: List[BatchRequest]): bool =
  b == Idle and requests.length() > 0 and
    requests.every((r) => r.customId != "" and
      requests.select((x) => x.customId == r.customId).length() == 1)

pure def submit(b: Batch, id: str, filename: str, requests: List[BatchRequest]): Batch =
  if (b == Idle)
    Working({ id: id, filename: filename,
      rows: requests.listMap((r) => { customId: r.customId, model: r.model, status: Queued, detail: "" }) })
  else b
```

### Running sends one queued or blocked row at a time

At most one row is ever in flight; a blocked row can be sent again.

```quint
pure def canStart(b: Batch, index: int): bool =
  match b {
    | Idle => false
    | Working(w) =>
      sending(b) == 0 and 0 <= index and index < w.rows.length() and
        (rowAt(b, index).status == Queued or rowAt(b, index).status == Blocked)
  }

pure def start(b: Batch, index: int): Batch =
  match b {
    | Idle => b
    | Working(w) =>
      if (canStart(b, index)) Working({ ...w, rows: setStatusAt(w.rows, index, Sending, "") }) else b
  }
```

### A row in flight settles one way

A sending row succeeds, fails, is blocked on credits or review, is
interrupted, or lands under review.

```quint
pure def settleable(b: Batch, index: int): bool =
  match b {
    | Idle => false
    | Working(w) => 0 <= index and index < w.rows.length() and rowAt(b, index).status == Sending
  }

pure def settleTo(index: int, status: RowStatus, detail: str, b: Batch): Batch =
  match b {
    | Idle => b
    | Working(w) =>
      if (settleable(b, index)) Working({ ...w, rows: setStatusAt(w.rows, index, status, detail) }) else b
  }

pure def canSucceed(b: Batch, index: int): bool = settleable(b, index)
pure def succeed(b: Batch, index: int): Batch = settleTo(index, Succeeded, "", b)

pure def canFailed(b: Batch, index: int): bool = settleable(b, index)
pure def failed(b: Batch, index: int, detail: str): Batch = settleTo(index, Failed, detail, b)

pure def canBlock(b: Batch, index: int): bool = settleable(b, index)
pure def block(b: Batch, index: int, detail: str): Batch = settleTo(index, Blocked, detail, b)

pure def canInterrupt(b: Batch, index: int): bool = settleable(b, index)
pure def interrupt(b: Batch, index: int, detail: str): Batch = settleTo(index, Interrupted, detail, b)

pure def canReview(b: Batch, index: int): bool = settleable(b, index)
pure def review(b: Batch, index: int, detail: str): Batch = settleTo(index, Review, detail, b)
```

### An interrupted row can go back in the queue

```quint
pure def canRetry(b: Batch, index: int): bool =
  match b {
    | Idle => false
    | Working(w) => 0 <= index and index < w.rows.length() and rowAt(b, index).status == Interrupted
  }

pure def retry(b: Batch, index: int): Batch =
  match b {
    | Idle => b
    | Working(w) =>
      if (canRetry(b, index)) Working({ ...w, rows: setStatusAt(w.rows, index, Queued, "") }) else b
  }
```

### Clearing drops the batch and starts over

```quint
pure def canClear(b: Batch): bool = b != Idle

pure def clear(b: Batch): Batch = Idle
```

### Row custom ids are never repeated inside a batch

```quint
pure def alwaysRowIdsUnique(b: Batch): bool =
  rows(b).every((r) => rows(b).select((x) => x.customId == r.customId).length() == 1)
```

### At most one row is ever in flight

```quint
pure def alwaysAtMostOneSending(b: Batch): bool = sending(b) <= 1
```

### A settled row stays settled until the batch is cleared

Succeeded, failed and reviewed rows never change state short of a clear;
blocked and interrupted rows can still move.

```quint
pure def stepSettledStaysSettled(before: Batch, via: str, after: Batch): bool =
  via == "clear" or
    rows(before).every((r) =>
      (r.status != Succeeded and r.status != Failed and r.status != Review) or
        rows(after).select((x) => x.customId == r.customId and x.status == r.status).length() == 1)
```

### A batch can finish

```quint
pure def sometimesFinished(b: Batch): bool =
  rows(b).length() > 0 and
    rows(b).every((r) => r.status == Succeeded or r.status == Failed or r.status == Review)
```

### A row can need attention

```quint
pure def sometimesNeedsAttention(b: Batch): bool =
  rows(b).some((r) => r.status == Blocked or r.status == Interrupted)
```

### Submitting queues every request

```quint
pure def lawSubmitQueuesEveryRow(id: str, filename: str, requests: List[BatchRequest]): bool =
  val b = submit(Idle, id, filename, requests)
  match b {
    | Idle => requests.length() == 0
    | Working(w) =>
      w.rows.length() == requests.length() and w.rows.every((r) => r.status == Queued)
  }
```

```quint
pure val idValues = Set("batch-1", "batch-2")

pure val filenameValues = Set("requests.jsonl", "nightly-batch.jsonl")

pure val requestsValues = Set(
  List({ customId: "row-1", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }),
  List({ customId: "row-1", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }, { customId: "row-2", model: "z-ai/glm-5.3-flash" }),
  List({ customId: "row-1", model: "a" }, { customId: "row-1", model: "b" }),
)

pure val indexValues = Set(0, 1, 2)

pure val detailValues = Set("Insufficient credits", "The gateway rejected this request", "Stream interrupted")
```
