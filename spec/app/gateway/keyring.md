# Gateway keyring

The API key records the gateway serves on the OpenAI-compatible endpoints.
The workspace owns the key lifecycle — it creates, revokes and stores keys —
and keeps the keyring under the KeyValueStore key `keys`. The gateway reads
that same store to authorize a bearer credential and records metered spend
back into it.

## Domain

### The stored keyring

Under the `keys` key the workspace stores a `Keyring`, a `keys` list whose
records each have exactly the fields `id`, `prefix`, `status`, `spendLimit`
and `spent`:

- `id` — the SHA-256 hex digest of the bearer token a client sends
  (`sonnely_live_…` or `fr_live_…` followed by 43 token characters). A record
  never holds the token itself.
- `prefix` — the token's display prefix.
- `status` — `Active` keys may serve; `Revoked` keys may never serve again.
- `spendLimit` — the lifetime spend cap in micro-USD; `-1` means uncapped.
- `spent` — metered spend recorded against the key in micro-USD. It only
  grows.

```quint
type KeyStatus = Active | Revoked

type KeyRecord = { id: str, prefix: str, status: KeyStatus, spendLimit: int, spent: int }

type Keyring = { keys: List[KeyRecord] }

pure val initial: Keyring = { keys: List() }
```

### A key may serve while it is active and under its limit

A revoked key and one whose spend has reached its limit cannot start a
request or take another charge.

```quint
pure def mayServe(k: KeyRecord): bool =
  k.status == Active and (k.spendLimit < 0 or k.spent < k.spendLimit)
```

### Values the checks sample

```quint
pure val idValues = Set("key_alpha", "key_beta", "key_gamma")

pure val prefixValues = Set("sonnely_live_a", "fr_live_b")

pure val spendLimitValues = Set(-1, 0, 250, 1000000)

pure val amountValues = Set(1, 7, 250, 1000000)
```

## Story: Authorize and meter a bearer key

> As the gateway, I want every served request to carry a live key under its
> spend limit, so that a revoked or exhausted key never serves.

### A key appears when the workspace enrolls it

Enrolling writes a fresh active record with no spend. The same id is never
enrolled twice and a limit of `-1` or more is required.

```quint
pure def canEnroll(r: Keyring, id: str, spendLimit: int): bool =
  spendLimit >= -1 and not(r.keys.some((k) => k.id == id))

pure def enroll(r: Keyring, id: str, prefix: str, spendLimit: int): Keyring =
  { keys: r.keys.concat(List({ id: id, prefix: prefix, status: Active, spendLimit: spendLimit, spent: 0 })) }
```

### The workspace revokes a live key

```quint
pure def canRevoke(r: Keyring, id: str): bool =
  r.keys.some((k) => k.id == id and k.status == Active)

pure def revoke(r: Keyring, id: str): Keyring =
  { keys: r.keys.listMap((k) => if (k.id == id) { ...k, status: Revoked } else k) }
```

### Metered spend lands on the key exactly as charged

Charging records `amount` of spend against an active key whose limit has
room for it. A revoked key, an unknown id, a non-positive amount or a charge
that would cross the limit is refused; the shell answers those refusals with
the OpenAI error shape (`401` for a missing or revoked key, `402` over
budget).

```quint
pure def canCharge(r: Keyring, id: str, amount: int): bool =
  amount > 0 and r.keys.some((k) => k.id == id and k.status == Active and (k.spendLimit < 0 or k.spent + amount <= k.spendLimit))

pure def charge(r: Keyring, id: str, amount: int): Keyring =
  { keys: r.keys.listMap((k) => if (k.id == id) { ...k, spent: k.spent + amount } else k) }
```

### Every enrolled id is unique

Two records that carry the same id are the same record — an id resolves to
exactly one key.

```quint
pure def sameKey(a: KeyRecord, b: KeyRecord): bool =
  a.prefix == b.prefix and a.status == b.status and a.spendLimit == b.spendLimit and a.spent == b.spent

pure def alwaysIdsUnique(r: Keyring): bool =
  r.keys.every((a) => r.keys.every((b) => a.id != b.id or sameKey(a, b)))
```

### Spend never exceeds a key's limit

```quint
pure def alwaysWithinLimit(r: Keyring): bool =
  r.keys.every((k) => k.spendLimit < 0 or k.spent <= k.spendLimit)
```

### Spend never becomes negative

```quint
pure def alwaysSpentNonNegative(r: Keyring): bool =
  r.keys.every((k) => k.spent >= 0)
```

### Spend accumulates monotonically

No step can lower a key's recorded spend.

```quint
pure def stepSpentNeverShrinks(before: Keyring, after: Keyring): bool =
  before.keys.every((b) => after.keys.every((a) => a.id != b.id or a.spent >= b.spent))
```

### Revocation is permanent

Once a key is revoked no step makes it active again.

```quint
pure def stepRevokedStaysRevoked(before: Keyring, after: Keyring): bool =
  before.keys.every((b) => after.keys.every((a) => a.id != b.id or b.status == Active or a.status == Revoked))
```

### A revoked key can never be charged

```quint
pure def lawRevokedNeverCharged(r: Keyring, id: str, amount: int): bool =
  not(alwaysIdsUnique(r) and r.keys.some((k) => k.id == id and k.status == Revoked)) or not(canCharge(r, id, amount))
```

### A charge never crosses the limit

```quint
pure def lawOverLimitNeverCharged(r: Keyring, id: str, amount: int): bool =
  not(alwaysIdsUnique(r) and r.keys.some((k) => k.id == id and k.spendLimit >= 0 and k.spent + amount > k.spendLimit)) or not(canCharge(r, id, amount))
```

### Spend can be recorded

```quint
pure def sometimesCharged(r: Keyring): bool = r.keys.some((k) => k.spent > 0)
```

### A key can be revoked

```quint
pure def sometimesRevoked(r: Keyring): bool = r.keys.some((k) => k.status == Revoked)
```
