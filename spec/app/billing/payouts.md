# Profit payouts

Inference charges include the platform's ten percent markup: when a customer
pays 110 percent of upstream cost, one eleventh of the charge is margin and
ten elevenths remain upstream-cost obligations. A profit payout moves part of
that margin, in USDC, from the treasury to the configured payout wallet. The
system never holds the treasury key: it prepares the exact unsigned transfer,
the operator signs and submits it elsewhere, and only a finalized on-chain
transfer carrying the payout reference, destination and exact amount may
verify the payout.

## Domain

### A payout binds margin to one exact treasury transfer

`amount` is both the micro-dollar margin amount and the exact micro-USDC the
transfer must move. `throughEntry` is the ledger entry count the revenue
window covers, and `chargeTotal` is the cumulative net inference customer
charge through that position. Because the customer charge is upstream cost
plus ten percent, `marginOf` keeps the margin share and conservatively floors
it to a whole micro-dollar; any fractional remainder stays in the treasury.
`Prepared` has no signature. `Executed` records the signature the operator
submitted, `Verified` the same signature after finality and exact-term
verification, `Failed` a submitted transaction that finalized unsuccessfully,
and `Cancelled` a prepared payout the operator abandoned before submission.

```quint
type PayoutStatus =
  | Prepared
  | Executed({ signature: str, executedAt: int })
  | Verified({ signature: str, verifiedAt: int })
  | Failed({ signature: str, failedAt: int, reason: str })
  | Cancelled({ cancelledAt: int, reason: str })

type Payout = {
  reference: str,
  destination: str,
  amount: int,
  preparedAt: int,
  throughEntry: int,
  chargeTotal: int,
  preparedBy: str,
  status: PayoutStatus,
}

type Payouts = { payouts: List[Payout] }

pure val initial: Payouts = { payouts: List() }

pure val payoutWallet: str = "9Bn8PpGhhp2a2xR1AnkpENPJNZe1m3Av852p993QdxUQ"
```

```quint
pure def marginOf(chargeTotal: int): int = chargeTotal / 11

pure def findPayout(p: Payouts, reference: str): List[Payout] =
  p.payouts.select(row => row.reference == reference)

pure def signatureOf(status: PayoutStatus): str =
  match status {
    | Executed(row) => row.signature
    | Verified(row) => row.signature
    | Failed(row) => row.signature
    | _ => ""
  }

pure def signatureTaken(p: Payouts, reference: str, signature: str): bool =
  p.payouts.some(row => row.reference != reference and signatureOf(row.status) == signature and signature != "")

pure def committedStatus(status: PayoutStatus): bool =
  match status {
    | Prepared => true
    | Executed(_) => true
    | Verified(_) => true
    | _ => false
  }

pure def liveStatus(status: PayoutStatus): bool =
  match status {
    | Prepared => true
    | Executed(_) => true
    | _ => false
  }

pure def committed(p: Payouts): int =
  p.payouts.foldl(0, (total, row) => if (committedStatus(row.status)) total + row.amount else total)

pure def hasLive(p: Payouts): bool = p.payouts.some(row => liveStatus(row.status))

pure def termsMatch(row: Payout, destination: str, amount: int): bool =
  row.destination == destination and row.amount == amount

pure def executedStatus(status: PayoutStatus): bool =
  match status {
    | Executed(_) => true
    | _ => false
  }

pure def verifiedStatus(status: PayoutStatus): bool =
  match status {
    | Verified(_) => true
    | _ => false
  }

pure def failedStatus(status: PayoutStatus): bool =
  match status {
    | Failed(_) => true
    | _ => false
  }

pure def cancelledStatus(status: PayoutStatus): bool =
  match status {
    | Cancelled(_) => true
    | _ => false
  }
```

```quint
pure val referenceValues = Set("ref-a", "ref-b")

pure val signatureValues = Set("sig-a", "sig-b")

pure val destinationValues = Set("9Bn8PpGhhp2a2xR1AnkpENPJNZe1m3Av852p993QdxUQ", "other")

pure val preparedByValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")

pure val amountValues = Set(0, 5, 11, 110)

pure val throughEntryValues = Set(0, 1, 5)

pure val chargeTotalValues = Set(0, 55, 110)

pure val preparedAtValues = Set(0, 5)

pure val executedAtValues = Set(0, 5, 10)

pure val verifiedAtValues = Set(0, 5, 10)

pure val failedAtValues = Set(0, 5, 10)

pure val cancelledAtValues = Set(0, 5, 10)

pure val reasonValues = Set("", "abandoned", "transaction failed")
```

## Story: Prepare a margin payout

> As an operator, I want an unsigned treasury transfer for margin that is
> really available, so that customer balances and upstream-cost obligations
> are never paid out.

### A payout covers only the markup share of the revenue window

The admin shell reads the append-only ledger and supplies `throughEntry` and
`chargeTotal` for the window being paid. The machine refuses a payout outside
the configured payout wallet, a non-positive amount, a reused reference, or
an amount that — together with payouts already prepared, executed or verified —
exceeds one eleventh of the supplied cumulative customer charge. Only one
prepared or executed payout may be live at a time, because the treasury key
acts outside the system and concurrent unsigned transfers cannot be ordered
here.

```quint
pure def canPrepare(p: Payouts, reference: str, destination: str, amount: int, throughEntry: int, chargeTotal: int, preparedAt: int, preparedBy: str): bool =
  reference != "" and destination == payoutWallet and amount > 0 and
  throughEntry >= 0 and chargeTotal >= 0 and preparedAt >= 0 and preparedBy != "" and
  findPayout(p, reference).length() == 0 and not(hasLive(p)) and
  committed(p) + amount <= marginOf(chargeTotal)

pure def prepare(p: Payouts, reference: str, destination: str, amount: int, throughEntry: int, chargeTotal: int, preparedAt: int, preparedBy: str): Payouts =
  if (canPrepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy)) {
    payouts: p.payouts.concat(List({
      reference: reference,
      destination: destination,
      amount: amount,
      preparedAt: preparedAt,
      throughEntry: throughEntry,
      chargeTotal: chargeTotal,
      preparedBy: preparedBy,
      status: Prepared,
    })),
  } else p
```

### References are never reused

```quint
pure def alwaysReferencesUnique(p: Payouts): bool =
  p.payouts.every(row => findPayout(p, row.reference).length() == 1)
```

### Every payout names the payout wallet and a positive margin amount

```quint
pure def alwaysPayoutsHoldTerms(p: Payouts): bool =
  p.payouts.every(row =>
    row.reference != "" and row.destination == payoutWallet and row.amount > 0 and
    row.preparedAt >= 0 and row.throughEntry >= 0 and row.chargeTotal >= 0 and row.preparedBy != "")
```

### A payout can be prepared

```quint
pure def sometimesPrepared(p: Payouts): bool = p.payouts.some(row => row.status == Prepared)
```

## Story: Record and verify the external execution

> As an operator, I want to paste the signature after signing with the
> treasury wallet, so that the system records only the transfer that really
> happened and never touches the key.

### Execution records one signature for one prepared payout

The signature is the operator's execution report. It is unique across payout
history. Repeating the same execution report is accepted without changing the
record, so a retried client request converges instead of creating a second
payout.

```quint
pure def executionAccepted(status: PayoutStatus, signature: str): bool =
  match status {
    | Prepared => true
    | Executed(row) => row.signature == signature
    | Verified(row) => row.signature == signature
    | Failed(row) => row.signature == signature
    | _ => false
  }

pure def canExecute(p: Payouts, reference: str, signature: str, executedAt: int): bool =
  val found = findPayout(p, reference)
  found.length() == 1 and signature != "" and executedAt >= found.head().preparedAt and
  not(signatureTaken(p, reference, signature)) and executionAccepted(found.head().status, signature)

pure def execute(p: Payouts, reference: str, signature: str, executedAt: int): Payouts = {
  payouts: p.payouts.listMap(row =>
    if (row.reference == reference and row.status == Prepared)
      { ...row, status: Executed({ signature: signature, executedAt: executedAt }) }
    else row),
}
```

### Verification requires the same signature and exact prepared terms

The payment service allows `markVerified` only after the configured cluster has
finalized a successful transaction whose signer is the treasury and whose
matching transfer carries this reference read-only, pays the payout wallet,
and moves exactly this amount of USDC. The machine binds those facts: the
reported signature, destination and amount must equal the prepared payout.
Repeating verification of the same signature is a no-op.

```quint

pure def executionOf(status: PayoutStatus, signature: str): bool =
  match status {
    | Executed(row) => row.signature == signature
    | _ => false
  }

pure def verificationAccepted(status: PayoutStatus, signature: str): bool =
  match status {
    | Executed(row) => row.signature == signature
    | Verified(row) => row.signature == signature
    | _ => false
  }

pure def canMarkVerified(p: Payouts, reference: str, signature: str, destination: str, amount: int, verifiedAt: int): bool =
  val found = findPayout(p, reference)
  found.length() == 1 and verificationAccepted(found.head().status, signature) and
  termsMatch(found.head(), destination, amount) and verifiedAt >= found.head().preparedAt

pure def markVerified(p: Payouts, reference: str, signature: str, destination: str, amount: int, verifiedAt: int): Payouts = {
  payouts: p.payouts.listMap(row =>
    if (row.reference == reference and executionOf(row.status, signature))
      { ...row, status: Verified({ signature: signature, verifiedAt: verifiedAt }) }
    else row),
}
```

### A failed execution releases the reservation, but a verified payout never fails

A transaction that finalized with an error did not move the margin. `markFailed`
closes the payout as failed only for the same signature and with a reason;
repeating the same failure is a no-op. Once verified, the payout is final.

```quint
pure def failureAccepted(status: PayoutStatus, signature: str): bool =
  match status {
    | Executed(row) => row.signature == signature
    | Failed(row) => row.signature == signature
    | _ => false
  }

pure def canMarkFailed(p: Payouts, reference: str, signature: str, failedAt: int, reason: str): bool =
  val found = findPayout(p, reference)
  found.length() == 1 and reason != "" and failedAt >= found.head().preparedAt and
  failureAccepted(found.head().status, signature)

pure def markFailed(p: Payouts, reference: str, signature: str, failedAt: int, reason: str): Payouts = {
  payouts: p.payouts.listMap(row =>
    if (row.reference == reference and executionOf(row.status, signature))
      { ...row, status: Failed({ signature: signature, failedAt: failedAt, reason: reason }) }
    else row),
}
```

### A prepared payout can be cancelled before execution

Cancellation only abandons an unsigned preparation. Once a signature has been
reported, the transaction may exist outside the system, so the payout must be
verified or failed rather than cancelled.

```quint
pure def cancellationAccepted(status: PayoutStatus): bool =
  match status {
    | Prepared => true
    | Cancelled(_) => true
    | _ => false
  }

pure def canCancel(p: Payouts, reference: str, cancelledAt: int, reason: str): bool =
  val found = findPayout(p, reference)
  found.length() == 1 and reason != "" and cancelledAt >= found.head().preparedAt and
  cancellationAccepted(found.head().status)

pure def cancel(p: Payouts, reference: str, cancelledAt: int, reason: str): Payouts = {
  payouts: p.payouts.listMap(row =>
    if (row.reference == reference and row.status == Prepared)
      { ...row, status: Cancelled({ cancelledAt: cancelledAt, reason: reason }) }
    else row),
}
```

### A signature names at most one payout

```quint
pure def alwaysSignaturesUnique(p: Payouts): bool =
  p.payouts.every(row =>
    signatureOf(row.status) == "" or not(signatureTaken(p, row.reference, signatureOf(row.status))))
```

### Once prepared, payout terms never change and terminal states never reopen

```quint
pure def forwardFrom(before: Payout, after: Payout): bool =
  after.destination == before.destination and after.amount == before.amount and
  after.preparedAt == before.preparedAt and after.throughEntry == before.throughEntry and
  after.chargeTotal == before.chargeTotal and after.preparedBy == before.preparedBy and
  (before.status == Prepared or after.status == before.status or
    (executedStatus(before.status) and (verifiedStatus(after.status) or failedStatus(after.status))))

pure def stepPayoutsOnlyMoveForward(before: Payouts, after: Payouts): bool =
  after.payouts.length() >= before.payouts.length() and
  before.payouts.every(row =>
    findPayout(after, row.reference).length() == 1 and
    after.payouts.every(candidate => candidate.reference != row.reference or forwardFrom(row, candidate)))
```

### A payout can be verified

```quint
pure def sometimesVerified(p: Payouts): bool =
  p.payouts.some(row => verifiedStatus(row.status))
```

```quint
pure val eval_witness_sometimesVerified = (
  ("prepare", "ref-a", "9Bn8PpGhhp2a2xR1AnkpENPJNZe1m3Av852p993QdxUQ", 5, 1, 110, 0, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
  ("execute", "ref-a", "sig-a", 5),
  ("markVerified", "ref-a", "sig-a", "9Bn8PpGhhp2a2xR1AnkpENPJNZe1m3Av852p993QdxUQ", 5, 10))
```

### A prepared payout can be cancelled

```quint
pure def sometimesCancelled(p: Payouts): bool =
  p.payouts.some(row => cancelledStatus(row.status))
```

```quint
pure val eval_witness_sometimesCancelled = (
  ("prepare", "ref-a", "9Bn8PpGhhp2a2xR1AnkpENPJNZe1m3Av852p993QdxUQ", 5, 1, 110, 0, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
  ("cancel", "ref-a", 5, "abandoned"))
```

### Verification is idempotent

```quint
pure def lawVerifyIsIdempotent(p: Payouts, reference: str, signature: str, destination: str, amount: int, verifiedAt: int): bool =
  markVerified(markVerified(p, reference, signature, destination, amount, verifiedAt), reference, signature, destination, amount, verifiedAt) ==
    markVerified(p, reference, signature, destination, amount, verifiedAt)
```
