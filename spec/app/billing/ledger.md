# Credit ledger

Each workspace holds a balance of compute credits, denominated in
micro-dollars. Every movement of the balance is an entry in an append-only
log: a deposit credit, a reservation hold, a final charge, or the release
or refund that returns unused credit. The balance is the sum of the log and
can never go below zero.

## Domain

### The ledger is a balance over an append-only entry log

Every entry belongs to a wallet, carries a positive amount in micro-dollars
and names what caused it: `Credit` for a deposit, `Reserve` for a hold,
`Charge` for settled spend, `Release` or `Refund` for credit returned, and
`AdjustCredit` or `AdjustDebit` for an operator's audited balance adjustment.
A credit's detail is the payment reference it came from, an adjustment's
detail is the audited adjustment record it carries out; every other entry's
detail is the request or rental it belongs to.

```quint
type EntryKind = Credit | Reserve | Charge | Release | Refund | AdjustCredit | AdjustDebit

type Entry = { wallet: str, kind: EntryKind, detail: str, amount: int }

type Ledger = { balance: int, entries: List[Entry] }

pure val initial: Ledger = { balance: 0, entries: List() }
```

```quint
pure def contribution(e: Entry): int =
  if (e.kind == Charge or e.kind == Reserve or e.kind == AdjustDebit) 0 - e.amount else e.amount

pure def sumOf(entries: List[Entry]): int =
  entries.foldl(0, (total, e) => total + contribution(e))

pure def balanceOf(l: Ledger, wallet: str): int =
  l.entries.foldl(0, (total, e) => if (e.wallet == wallet) total + contribution(e) else total)

pure def entrySum(l: Ledger, wallet: str, detail: str, kind: EntryKind): int =
  l.entries.foldl(0, (total, e) =>
    if (e.wallet == wallet and e.detail == detail and e.kind == kind) total + e.amount else total)

pure def heldOf(l: Ledger, wallet: str, detail: str): int =
  entrySum(l, wallet, detail, Reserve) - entrySum(l, wallet, detail, Release)
```

```quint
pure val walletValues = Set("", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn")

pure val detailValues = Set("ref-a", "ref-b")

pure val amountValues = Set(0, 5, 10)
```

## Story: Move credit

> As a workspace, I want my deposits to raise my balance and my inference to
> spend it, so that what I can spend is always what I have.

### A deposit credits the wallet once per reference

A credit names the payment reference it came from. Crediting the same
reference a second time — a retried confirmation or a replayed webhook —
changes nothing.

```quint
pure def canCredit(l: Ledger, wallet: str, detail: str, amount: int): bool =
  wallet != "" and amount > 0

pure def credit(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  if (l.entries.some(e => e.kind == Credit and e.detail == detail)) l
  else {
    balance: l.balance + amount,
    entries: l.entries.concat(List({ wallet: wallet, kind: Credit, detail: detail, amount: amount })),
  }
```

### A reservation holds only what the wallet covers, once per detail

Reserving moves the maximum estimated cost out of the wallet's available
balance before work starts. A wallet and detail name one reservation ever,
so a retry cannot hold the same work twice.

```quint
pure def canReserve(l: Ledger, wallet: str, detail: str, amount: int): bool =
  wallet != "" and detail != "" and amount > 0
  and balanceOf(l, wallet) >= amount and l.balance >= amount
  and not(l.entries.some(e => e.wallet == wallet and e.detail == detail and e.kind == Reserve))

pure def reserve(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  if (canReserve(l, wallet, detail, amount)) {
    balance: l.balance - amount,
    entries: l.entries.concat(List({ wallet: wallet, kind: Reserve, detail: detail, amount: amount })),
  } else l
```

### Settlement releases the reservation and records its final charge

Settlement is one ledger step: it releases the whole outstanding hold and
charges the metered amount, never more than the hold. The wallet's balance
therefore rises by exactly the unspent part of the reservation.

```quint
pure def canSettleHold(l: Ledger, wallet: str, detail: str, amount: int): bool =
  wallet != "" and detail != "" and amount >= 0
  and heldOf(l, wallet, detail) > 0 and amount <= heldOf(l, wallet, detail)

pure def settleHold(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  val held = heldOf(l, wallet, detail)
  val released = { wallet: wallet, kind: Release, detail: detail, amount: held }
  val entries = if (amount == 0) List(released)
    else List(released, { wallet: wallet, kind: Charge, detail: detail, amount: amount })
  if (canSettleHold(l, wallet, detail, amount)) {
    balance: l.balance + held - amount,
    entries: l.entries.concat(entries),
  } else l
```

### A failed reservation releases its whole hold

```quint
pure def canRelease(l: Ledger, wallet: str, detail: str): bool =
  wallet != "" and detail != "" and heldOf(l, wallet, detail) > 0

pure def release(l: Ledger, wallet: str, detail: str): Ledger =
  val held = heldOf(l, wallet, detail)
  if (canRelease(l, wallet, detail)) {
    balance: l.balance + held,
    entries: l.entries.concat(List({ wallet: wallet, kind: Release, detail: detail, amount: held })),
  } else l
```

### A charge spends only what the wallet holds

```quint
pure def canCharge(l: Ledger, wallet: str, amount: int): bool =
  amount > 0 and balanceOf(l, wallet) >= amount and l.balance >= amount

pure def charge(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  if (canCharge(l, wallet, amount)) {
    balance: l.balance - amount,
    entries: l.entries.concat(List({ wallet: wallet, kind: Charge, detail: detail, amount: amount })),
  } else l
```

### A refund returns no more than its charge took

A refund names the same detail as the charge it releases. The refunds on one
detail never exceed what the charges on it took.

```quint
pure def canRefund(l: Ledger, wallet: str, detail: str, amount: int): bool =
  amount > 0 and amount <= entrySum(l, wallet, detail, Charge) - entrySum(l, wallet, detail, Refund)

pure def refund(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  if (canRefund(l, wallet, detail, amount)) {
    balance: l.balance + amount,
    entries: l.entries.concat(List({ wallet: wallet, kind: Refund, detail: detail, amount: amount })),
  } else l
```

### The balance is always the sum of its entries

```quint
pure def alwaysBalanceIsTheSum(l: Ledger): bool = l.balance == sumOf(l.entries)
```

### The balance is never negative

```quint
pure def alwaysBalanceIsNotNegative(l: Ledger): bool = l.balance >= 0
```

### Entries are never rewritten or removed

```quint
pure def isPrefix(shorter: List[Entry], longer: List[Entry]): bool =
  shorter.foldl(0, (i, e) => if (i >= 0 and longer.nthOr(i, e) == e) i + 1 else 0 - 1) >= 0

pure def stepEntriesAppendOnly(before: Ledger, after: Ledger): bool =
  after.entries.length() >= before.entries.length() and isPrefix(before.entries, after.entries)
```

### A charge fires only while the balance covers it

```quint
pure def stepChargeIsCovered(before: Ledger, via: str, after: Ledger): bool =
  val e = after.entries.nthOr(before.entries.length(), { wallet: "", kind: Charge, detail: "", amount: 0 })
  via != "charge" or
    (after.entries.length() == before.entries.length() + 1 and
      e.kind == Charge and balanceOf(before, e.wallet) >= e.amount)
```

### A reference appears as a credit at most once

```quint
pure def alwaysCreditsOnce(l: Ledger): bool =
  l.entries.every(e => e.kind != Credit or
    l.entries.select(j => j.kind == Credit and j.detail == e.detail).length() == 1)
```

### Credit can arrive

```quint
pure def sometimesCredited(l: Ledger): bool = l.balance > 0
```

### Inference can be charged

```quint
pure def sometimesCharged(l: Ledger): bool = l.entries.some(e => e.kind == Charge)
```

### A reservation can be held, settled or released

```quint
pure def sometimesReserved(l: Ledger): bool = l.entries.some(e => e.kind == Reserve)

pure def sometimesSettled(l: Ledger): bool =
  l.entries.some(e => e.kind == Release) and l.entries.some(e => e.kind == Charge)

pure def sometimesReleased(l: Ledger): bool =
  l.entries.some(e => e.kind == Release) and not(l.entries.some(e => e.kind == Charge))

pure val eval_witness_sometimesSettled = (
  ("credit", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "ref-a", 10),
  ("reserve", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "ref-b", 5),
  ("settleHold", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "ref-b", 5))

pure val eval_witness_sometimesReleased = (
  ("credit", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "ref-a", 10),
  ("reserve", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "ref-b", 5),
  ("release", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "ref-b"))
```

### A charge can be partly refunded

```quint
pure def sometimesRefunded(l: Ledger): bool = l.entries.some(e => e.kind == Refund)
```

### Crediting a reference twice credits it once

```quint
pure def lawCreditIsIdempotent(l: Ledger, wallet: str, detail: str, amount: int): bool =
  credit(credit(l, wallet, detail, amount), wallet, detail, amount) == credit(l, wallet, detail, amount)
```

### A charge debits exactly its amount

```quint
pure def lawChargeDebitsExactly(l: Ledger, wallet: str, detail: str, amount: int): bool =
  amount <= 0 or balanceOf(l, wallet) < amount or l.balance < amount or
    charge(l, wallet, detail, amount).balance == l.balance - amount
```

## Story: Adjust a balance

> As an operator, I want a balance adjustment to move the customer's credit
> exactly once, so that the audited record and the balance never disagree.

### An adjustment credits or debits once per record

A positive adjustment credits the wallet; a negative one debits only what
the wallet holds. Both name the audited adjustment record they carry out,
so a retried write — the operator retrying a failed request — changes
nothing.

```quint
pure def adjustmentWritten(l: Ledger, detail: str): bool =
  l.entries.some(e => e.detail == detail and (e.kind == AdjustCredit or e.kind == AdjustDebit))

pure def canAdjustCredit(l: Ledger, wallet: str, detail: str, amount: int): bool =
  wallet != "" and detail != "" and amount > 0
  and not(adjustmentWritten(l, detail))

pure def adjustCredit(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  if (adjustmentWritten(l, detail)) l
  else {
    balance: l.balance + amount,
    entries: l.entries.concat(List({ wallet: wallet, kind: AdjustCredit, detail: detail, amount: amount })),
  }

pure def canAdjustDebit(l: Ledger, wallet: str, detail: str, amount: int): bool =
  wallet != "" and detail != "" and amount > 0
  and balanceOf(l, wallet) >= amount and l.balance >= amount
  and not(adjustmentWritten(l, detail))

pure def adjustDebit(l: Ledger, wallet: str, detail: str, amount: int): Ledger =
  if (canAdjustDebit(l, wallet, detail, amount)) {
    balance: l.balance - amount,
    entries: l.entries.concat(List({ wallet: wallet, kind: AdjustDebit, detail: detail, amount: amount })),
  } else l
```

### An adjustment can arrive in either direction

```quint
pure def sometimesAdjustCredited(l: Ledger): bool = l.entries.some(e => e.kind == AdjustCredit)

pure def sometimesAdjustDebited(l: Ledger): bool = l.entries.some(e => e.kind == AdjustDebit)
```

### Adjusting a record twice adjusts it once

```quint
pure def lawAdjustCreditIsIdempotent(l: Ledger, wallet: str, detail: str, amount: int): bool =
  adjustCredit(adjustCredit(l, wallet, detail, amount), wallet, detail, amount) == adjustCredit(l, wallet, detail, amount)

pure def lawAdjustDebitIsIdempotent(l: Ledger, wallet: str, detail: str, amount: int): bool =
  adjustDebit(adjustDebit(l, wallet, detail, amount), wallet, detail, amount) == adjustDebit(l, wallet, detail, amount)
```
