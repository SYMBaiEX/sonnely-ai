# Deposits

A deposit starts as a payment intent the treasury can recognize on Solana: a
fresh reference, the wallet that will pay, the asset — SOL or USDC — and the
exact amount the transfer must move. Only a transfer the configured cluster
has finalized, carrying the intent's reference and moving the intent's exact
amount of its asset from the intent's wallet to the treasury, may finalize
it. An intent lives for a bounded time, and the deadline binds the transfer,
not its discovery: a transfer the chain timed at or before the deadline
finalizes the intent however late it is found, and one the chain timed after
it never can.

## Domain

### An intent binds a transfer to the credit it buys

`amount` is the credit in micro-dollars the deposit buys; `atomic` is the
exact on-chain amount the transfer must move — micro-USDC for USDC, lamports
for SOL. `Finalized` carries the signature of the transfer that paid.

```quint
type Asset = SOL | USDC

type DepositStatus = Pending | Finalized({ signature: str }) | Expired

type Intent = {
  reference: str,
  wallet: str,
  asset: Asset,
  amount: int,
  atomic: int,
  createdAt: int,
  expiresAt: int,
  status: DepositStatus,
}

type Deposits = { intents: List[Intent] }

pure val initial: Deposits = { intents: List() }
```

```quint
pure def findIntent(d: Deposits, reference: str): List[Intent] =
  d.intents.select(i => i.reference == reference)

pure def signatureOf(status: DepositStatus): str =
  match status { | Finalized(f) => f.signature | _ => "" }

pure def signatureTaken(d: Deposits, reference: str, signature: str): bool =
  d.intents.some(i => i.reference != reference and signatureOf(i.status) == signature and signature != "")

pure def termsMatch(i: Intent, wallet: str, asset: Asset, amount: int, atomic: int): bool =
  i.wallet == wallet and i.asset == asset and i.amount == amount and i.atomic == atomic

pure def statusAccepts(status: DepositStatus, signature: str, expiresAt: int, paidAt: int): bool =
  match status { | Finalized(f) => f.signature == signature | _ => paidAt <= expiresAt }
```

```quint
pure val referenceValues = Set("ref-a", "ref-b")

pure val signatureValues = Set("sig-a", "sig-b")

pure val walletValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn")

pure val amountValues = Set(0, 5, 10)

pure val atomicValues = Set(0, 5, 10)

pure val createdAtValues = Set(0, 1)

pure val expiresAtValues = Set(0, 5, 10)

pure val nowValues = Set(0, 5, 10, 20)

pure val paidAtValues = Set(0, 5, 10, 20)
```

## Story: Open a payment intent

> As a workspace member, I want a payment link I can pay from my wallet, so
> that the transfer I send is recognized as mine.

### Every intent's reference is unique

A reference is a Solana public key chosen fresh for one intent. A second
intent with the same reference is refused, and so is one with no wallet, a
non-positive amount or atomic, or a deadline at or before its creation.

```quint
pure def canOpen(d: Deposits, reference: str, wallet: str, amount: int, atomic: int, createdAt: int, expiresAt: int): bool =
  reference != "" and wallet != "" and amount > 0 and atomic > 0 and createdAt >= 0 and
  expiresAt > createdAt and findIntent(d, reference).length() == 0

pure def open(d: Deposits, reference: str, wallet: str, asset: Asset, amount: int, atomic: int, createdAt: int, expiresAt: int): Deposits =
  if (canOpen(d, reference, wallet, amount, atomic, createdAt, expiresAt)) {
    intents: d.intents.concat(List({
      reference: reference, wallet: wallet, asset: asset, amount: amount, atomic: atomic,
      createdAt: createdAt, expiresAt: expiresAt, status: Pending,
    })),
  } else d
```

### References are never reused

```quint
pure def alwaysReferencesUnique(d: Deposits): bool =
  d.intents.every(i => findIntent(d, i.reference).length() == 1)
```

### Every open intent names a wallet and positive amounts

```quint
pure def alwaysIntentsHoldTerms(d: Deposits): bool =
  d.intents.every(i =>
    i.reference != "" and i.wallet != "" and i.amount > 0 and i.atomic > 0 and
    i.createdAt >= 0 and i.expiresAt > i.createdAt)
```

## Story: Finalize a paid intent

> As a workspace member, I want my finalized transfer counted once, so that
> the credits I paid for appear exactly once.

### A finalized transfer is bound to wallet, asset, exact amounts and reference

The payment service supplies `finalize` only after it confirms the signature
names a transaction the configured cluster has finalized: one whose single
matching transfer instruction carries this reference read-only, is signed by
the intent's wallet, and moves the intent's exact `atomic` of the intent's
asset to the treasury. `paidAt` is that transaction's chain time, read from
its finalized block. The spec binds those facts: the reported wallet,
asset and amounts must equal the intent's, and the transfer's chain time
must not pass the intent's deadline — however late the transfer is
discovered, and whether the intent is still pending or already lapsed. An
intent already finalized accepts the same confirmation again — each
reference credits once.

```quint
pure def canFinalize(d: Deposits, reference: str, signature: str, wallet: str, asset: Asset, amount: int, atomic: int, paidAt: int): bool =
  val found = findIntent(d, reference)
  found.length() == 1 and signature != "" and not(signatureTaken(d, reference, signature)) and
  termsMatch(found.head(), wallet, asset, amount, atomic) and
  statusAccepts(found.head().status, signature, found.head().expiresAt, paidAt)

pure def finalize(d: Deposits, reference: str, signature: str, wallet: str, asset: Asset, amount: int, atomic: int, paidAt: int): Deposits = {
  intents: d.intents.listMap(i =>
    if (i.reference == reference and (i.status == Pending or i.status == Expired)) { ...i, status: Finalized({ signature: signature }) } else i),
}
```

### A signature finalizes at most one intent

```quint
pure def alwaysSignaturesUnique(d: Deposits): bool =
  d.intents.every(i =>
    signatureOf(i.status) == "" or not(signatureTaken(d, i.reference, signatureOf(i.status))))
```

### Once opened, an intent's terms never change and it never reopens

```quint
pure def finalizedStatus(status: DepositStatus): bool =
  match status { | Finalized(_) => true | _ => false }

pure def forwardFrom(i: Intent, j: Intent): bool =
  j.wallet == i.wallet and j.asset == i.asset and j.amount == i.amount and j.atomic == i.atomic and
  j.createdAt == i.createdAt and j.expiresAt == i.expiresAt and
  (i.status == Pending or j.status == i.status or (i.status == Expired and finalizedStatus(j.status)))

pure def stepIntentsOnlyMoveForward(before: Deposits, after: Deposits): bool =
  after.intents.length() >= before.intents.length() and
  before.intents.every(i =>
    findIntent(after, i.reference).length() == 1 and
    after.intents.every(j => j.reference != i.reference or forwardFrom(i, j)))
```

### An intent can be finalized

```quint
pure def sometimesFinalized(d: Deposits): bool =
  d.intents.some(i => signatureOf(i.status) != "")
```

```quint
pure val eval_witness_sometimesFinalized =
  (("open", "ref-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", USDC, 5, 5, 0, 10),
   ("finalize", "ref-a", "sig-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", USDC, 5, 5, 0))
```

## Story: Watch an intent expire

> As a workspace member, I want a payment link to lapse, so that a transfer
> sent too late cannot be mistaken for a newer request.

### An expired intent is closed to new payments, not to timely ones

Once an intent's deadline passes, `expire` records that the payment link has
lapsed: a transfer the chain times after the deadline can never finalize it.
Expiry is not what refuses late transfers — the deadline is — so a transfer
whose chain time beat the deadline still finalizes an expired intent when it
is discovered, and nothing ever reopens an intent to pending.

```quint
pure def canExpire(d: Deposits, reference: str, now: int): bool =
  val found = findIntent(d, reference)
  found.length() == 1 and found.head().status == Pending and found.head().expiresAt <= now

pure def expire(d: Deposits, reference: str, now: int): Deposits = {
  intents: d.intents.listMap(i =>
    if (i.reference == reference and i.status == Pending and i.expiresAt <= now) { ...i, status: Expired } else i),
}
```

### An intent can expire

```quint
pure def sometimesExpired(d: Deposits): bool = d.intents.some(i => i.status == Expired)
```

```quint
pure val eval_witness_sometimesExpired =
  (("open", "ref-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", USDC, 5, 5, 0, 10),
   ("expire", "ref-a", 10))
```

### Finalizing is idempotent

```quint
pure def lawFinalizeIsIdempotent(d: Deposits, reference: str, signature: str, wallet: str, asset: Asset, amount: int, atomic: int, paidAt: int): bool =
  finalize(finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt), reference, signature, wallet, asset, amount, atomic, paidAt) ==
    finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt)
```

### Expiring is idempotent

```quint
pure def lawExpireIsIdempotent(d: Deposits, reference: str, now: int): bool =
  expire(expire(d, reference, now), reference, now) == expire(d, reference, now)
```
