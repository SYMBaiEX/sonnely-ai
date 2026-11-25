# Keys

API keys are how a workspace calls the inference API. A key has a label, a
shown-once secret the workspace keeps (only its prefix and SHA-256 hash are
recorded here), the wallet whose credits pay for it, optional daily and
lifetime spend limits, an optional expiry, and a status. A key scoped to a
team project records the project's id.

**Stored shape.** The machine's state is kept as JSON under the KeyValueStore
key `workspace-keys`; it is the registry the console's Keys area owns and the
record the gateway authorizes and meters inference against:

```json
{ "keys": [ {
  "id": "k1", "label": "CI key", "prefix": "sonnely_live_aaaaaaa",
  "hash": "<sha256 hex>", "wallet": "<solana wallet>", "project": "", "scopes": ["inference"],
  "cap": 0, "dailyCap": 0, "expiresAt": 0,
  "status": "Active", "createdAt": 0, "lastUsedAt": 0,
  "spent": 0, "dayKey": "", "daySpent": 0
} ] }
```

Amounts are micro-USD; `cap`, `dailyCap`, `expiresAt` and `lastUsedAt` are `0`
when unset. `expiresAt`, `createdAt` and `lastUsedAt` are milliseconds.
`dayKey` is the UTC day (`YYYY-MM-DD`) `daySpent` counts. `spent` and
`daySpent` count both final charges and reservations still held; releasing or
settling a hold for less than its reservation subtracts the difference.
`status` is `"Active"` or `"Revoked"`; it never returns to `"Active"`.

## Domain

### A key record and its lifetime

```quint
type KeyStatus = Active | Revoked

type Key = {
  id: str,
  label: str,
  prefix: str,
  hash: str,
  wallet: str,
  project: str,
  scopes: Set[str],
  cap: int,
  dailyCap: int,
  expiresAt: int,
  status: KeyStatus,
  createdAt: int,
  lastUsedAt: int,
  spent: int,
  dayKey: str,
  daySpent: int,
}

type Keys = { keys: List[Key] }
```

### The registry starts empty

```quint
pure val initial: Keys = { keys: List() }
```

```quint
pure def keyWithId(s: Keys, id: str): List[Key] = s.keys.select(k => k.id == id)

pure def capOk(cap: int): bool = cap == 0 or cap >= 10000

pure val idValues = Set("k1", "k2")
pure val labelValues = Set("CI key", "Workspace key")
pure val prefixValues = Set("sonnely_live_aaaaaaa", "sonnely_live_bbbbbbb")
pure val hashValues = Set("hash1", "hash2")
pure val walletValues = Set("w1", "w2")
pure val projectValues = Set("", "p1")
pure val scopesValues = Set(Set("inference")).union(Set(Set("inference", "batch")))
pure val capValues = Set(0, 10000)
pure val dailyCapValues = Set(0, 10000)
pure val expiresAtValues = Set(0, 2000)
pure val nowValues = Set(0, 1000, 5000)
pure val costValues = Set(0, 1, 5000, 9000)
pure val dayValues = Set("2026-01-05", "2026-01-06")
```

## Story: Issue a key

> As a workspace member, I want to create an API key with a label, optional
> daily and lifetime spend limits and an optional expiry, so that clients can
> call the API within a budget I set.

### A new key needs a name, unique credentials and valid limits

The label is nonempty — the product allows up to 60 characters; spending caps start at $0.01 (10,000
micro-USD) or are unset; an expiry, when set, is in the future; ids,
prefixes and hashes are unique across all keys ever registered; a key
always carries at least one scope.

```quint
pure def canCreate(s: Keys, id: str, label: str, prefix: str, hash: str, wallet: str, project: str, scopes: Set[str], cap: int, dailyCap: int, expiresAt: int, now: int): bool =
  id != "" and label != ""
  and prefix != "" and hash != "" and wallet != "" and scopes.size() >= 1
  and capOk(cap) and capOk(dailyCap) and now >= 0
  and (expiresAt == 0 or expiresAt > now)
  and s.keys.every(k => k.id != id and k.prefix != prefix and k.hash != hash)

pure def create(s: Keys, id: str, label: str, prefix: str, hash: str, wallet: str, project: str, scopes: Set[str], cap: int, dailyCap: int, expiresAt: int, now: int): Keys =
  { keys: s.keys.append({
      id: id, label: label, prefix: prefix, hash: hash, wallet: wallet, project: project, scopes: scopes,
      cap: cap, dailyCap: dailyCap, expiresAt: expiresAt,
      status: Active, createdAt: now, lastUsedAt: 0, spent: 0, dayKey: "", daySpent: 0 }) }
```

### A workspace key can be renamed and have its limits updated

An active workspace key — one not scoped to a project — can be relabelled
and have its caps and expiry changed under the same rules as creation.

```quint
pure def canUpdate(s: Keys, id: str, label: str, cap: int, dailyCap: int, expiresAt: int, now: int): bool =
  keyWithId(s, id).some(k => k.status == Active and k.project == "")
  and label != ""
  and capOk(cap) and capOk(dailyCap) and now >= 0
  and (expiresAt == 0 or expiresAt > now)

pure def update(s: Keys, id: str, label: str, cap: int, dailyCap: int, expiresAt: int, now: int): Keys =
  { keys: s.keys.listMap(k =>
      if (k.id == id) { ...k, label: label, cap: cap, dailyCap: dailyCap, expiresAt: expiresAt } else k) }
```

### Every registered key is well formed

```quint
pure def alwaysKeysAreWellFormed(s: Keys): bool =
  s.keys.every(k =>
    k.id != "" and k.label != ""
    and k.prefix != "" and k.hash != "" and k.wallet != "" and k.scopes.size() >= 1
    and capOk(k.cap) and capOk(k.dailyCap)
    and k.expiresAt >= 0 and k.createdAt >= 0 and k.lastUsedAt >= 0
    and k.spent >= 0 and k.daySpent >= 0 and k.daySpent <= k.spent
    and (k.lastUsedAt == 0 iff k.dayKey == "")
    and (k.lastUsedAt != 0 implies k.lastUsedAt >= k.createdAt))
```

### Ids, prefixes and hashes are unique across the registry

```quint
pure def alwaysCredentialsAreUnique(s: Keys): bool =
  s.keys.every(k =>
    s.keys.select(o => o.id == k.id).length() == 1
    and s.keys.select(o => o.prefix == k.prefix).length() == 1
    and s.keys.select(o => o.hash == k.hash).length() == 1)
```

### A workspace can hold a capped and an uncapped key

```quint
pure def sometimesCappedAndUncapped(s: Keys): bool =
  s.keys.some(k => k.cap > 0) and s.keys.some(k => k.cap == 0)
```

## Story: Spend through a key

> As the gateway, I want each metered request to reserve its cost on the key
> it used and return whatever the final charge does not spend, so that caps
> hold while work is in flight and the console can show last used and today's
> spend.

### Only an active key within its limits can be metered

A revoked or expired key accepts nothing: metering refuses once the lifetime
cap or the day's cap would be exceeded. The reserved amount counts against
both caps while the request is in flight.

```quint
pure def canRecordUse(s: Keys, id: str, cost: int, day: str, now: int): bool =
  cost >= 0 and day != "" and now > 0
  and keyWithId(s, id).some(k => k.status == Active and now >= k.createdAt and now >= k.lastUsedAt
    and (k.expiresAt == 0 or now < k.expiresAt))
  and keyWithId(s, id).every(k => k.cap == 0 or k.spent + cost <= k.cap)
  and keyWithId(s, id).every(k => k.dailyCap == 0 or (if (k.dayKey == day) k.daySpent else 0) + cost <= k.dailyCap)

pure def recordUse(s: Keys, id: str, cost: int, day: str, now: int): Keys =
  { keys: s.keys.listMap(k =>
      if (k.id == id)
        { ...k, lastUsedAt: now, spent: k.spent + cost,
                dayKey: day, daySpent: (if (k.dayKey == day) k.daySpent else 0) + cost }
      else k) }
```

### Releasing a hold returns what was not charged

When a reservation settles for less than it held, or fails outright, the
difference leaves the key's lifetime tally. It leaves the day tally too when
the reservation belongs to the day that tally still counts; an older day's
tally no longer caps new use, so nothing is subtracted there.

```quint
pure def canRefundUse(s: Keys, id: str, amount: int, day: str): bool =
  amount > 0 and day != ""
  and keyWithId(s, id).some(k =>
    k.spent >= amount and
    (if (k.dayKey == day) k.daySpent >= amount else k.spent - k.daySpent >= amount))

pure def refundUse(s: Keys, id: str, amount: int, day: str): Keys =
  { keys: s.keys.listMap(k =>
      if (k.id == id)
        { ...k, spent: k.spent - amount,
                daySpent: if (k.dayKey == day) k.daySpent - amount else k.daySpent }
      else k) }
```

### Spend moves only with metering or a returned hold

Final charges and reservations raise the tally; only returning part of a
reservation lowers it, and never below what the key still owes.

```quint
pure def stepSpendMovesOnlyWithUse(before: Keys, via: str, after: Keys): bool =
  before.keys.every(k =>
    keyWithId(after, k.id).every(a =>
      a.spent == k.spent
      or (via == "recordUse" and a.spent >= k.spent and a.lastUsedAt >= k.lastUsedAt)
      or (via == "refundUse" and a.spent <= k.spent and a.lastUsedAt == k.lastUsedAt)))
```

### Only metering or a returned hold touches last used and the day's tally

```quint
pure def stepUseMarksUse(before: Keys, via: str, after: Keys): bool =
  before.keys.every(k =>
    keyWithId(after, k.id).every(a =>
      (a.lastUsedAt == k.lastUsedAt and a.dayKey == k.dayKey and a.daySpent == k.daySpent)
      or via == "recordUse" or via == "refundUse"))
```

### A key can be metered

```quint
pure def sometimesMetered(s: Keys): bool = s.keys.some(k => k.lastUsedAt != 0)
```

## Story: Revoke a key

> As a workspace member, I want to revoke a key, so that clients using it
> lose API access immediately and forever.

### Only an active key can be revoked

```quint
pure def canRevoke(s: Keys, id: str): bool =
  keyWithId(s, id).some(k => k.status == Active)

pure def revoke(s: Keys, id: str): Keys =
  { keys: s.keys.listMap(k => if (k.id == id) { ...k, status: Revoked } else k) }
```

### Revoked is final

```quint
pure def stepRevokedStaysRevoked(before: Keys, after: Keys): bool =
  before.keys.every(k =>
    k.status == Active or keyWithId(after, k.id).every(a => a.status == Revoked))
```

### A revoked key can be shown

```quint
pure def sometimesRevoked(s: Keys): bool = s.keys.some(k => k.status == Revoked)
```

### A revoked key takes no update and no metering

```quint
pure def lawRevokedIsFinal(s: Keys, id: str, label: str, prefix: str, hash: str, wallet: str, project: str, scopes: Set[str], cap: int, dailyCap: int, expiresAt: int, now: int, cost: int, day: str): bool =
  val after = revoke(create(s, id, label, prefix, hash, wallet, project, scopes, cap, dailyCap, expiresAt, now), id)
  keyWithId(s, id).length() != 0
  or (keyWithId(after, id).every(k => k.status == Revoked)
      and not(canUpdate(after, id, label, cap, dailyCap, expiresAt, now))
      and not(canRecordUse(after, id, cost, day, now)))
```
