# Admin

The operator surface: the console's Admin section, its account moderation
and the audit trail every privileged change leaves. The operator directory
is a component ([Operators](./operators.md)) this machine embeds; the
customer and log views are read shapes over shared state ();
referrals have their own lifecycle ([Referrals](./referrals.md)).

## Domain

### The admin machine

The state the admin surface owns: the operator directory, the account
registry it moderates (users and orgs, each Active or Suspended, with the
usage the account has accrued), and the audit trail.

```quint
import operators as O from "./operators"

type Subject = User | Org

type Status = Active | Suspended

type Account = { id: str, subject: Subject, status: Status, usage: int }

type Audit = { at: int, actor: str, act: str, target: str, summary: str }

type Registry = { ops: O::Directory, records: List[Account], audit: List[Audit] }

pure val initial: Registry = { ops: O::empty, records: List(), audit: List() }

pure val walletValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn", "4vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2d")

pure val byValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn", "4vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2d")

pure val idValues = Set("acct-a", "acct-b", "org-a")
```

### What the admin reads elsewhere

The admin machine keeps only what it owns. The views join it, through the
shell, with the state other areas keep in the same store: `session` holds
`{ tag: "SignedIn", wallet: str }` or `{ tag: "SignedOut" }`; `keys` holds
the API keys an account issued; `billing` holds the credit ledger an
account's balance and deposits come from; `usage` holds the request records
the traces and analytics views aggregate; `support` holds the tickets the
support inbox lists; `teams` holds the workspaces an account belongs to.
Each is read as untrusted JSON — a view shows `—` for what a key does not
hold or does not carry in the shape it expects.

```quint
pure val joinedKeys: List[str] = List("session", "keys", "billing", "usage", "support", "teams")
```

## Story: Grant and revoke access

> As an operator, I want to add and remove operator wallets, so that the
> admin surface answers only to the people who should run it.

The admin machine embeds the operator directory and answers its grant and
revoke with an audit entry.

### Only an operator can grant access

The rule is the directory's own: an empty directory appoints its first
operator from whoever asks, then only a listed operator may grant.

```quint
pure def canGrant(a: Registry, by: str, wallet: str, role: O::Role): bool =
  O::canGrant(a.ops, by, wallet, role)

pure def grant(a: Registry, by: str, wallet: str, role: O::Role, at: int): Registry =
  { ...a,
    ops: O::grant(a.ops, by, wallet, role),
    audit: a.audit.concat(List({ at: at, actor: by, act: "operators.grant", target: wallet, summary: "Operator access granted" })) }
```

### The last operator cannot be revoked

```quint
pure def canRevoke(a: Registry, by: str, wallet: str): bool =
  O::canRevoke(a.ops, by, wallet)

pure def revoke(a: Registry, by: str, wallet: str, at: int): Registry =
  { ...a,
    ops: O::revoke(a.ops, by, wallet),
    audit: a.audit.concat(List({ at: at, actor: by, act: "operators.revoke", target: wallet, summary: "Operator access revoked" })) }
```

## Story: Moderate accounts

> As an operator, I want to suspend an account's inference access and
> restore it later, and to see how much usage each account accrued, so that
> abuse can be stopped without losing the record.

### Every admin change checks the sender

Every privileged transition names the wallet that asked for it, and except
for the bootstrap grant that wallet must be a listed operator.

```quint
pure def isOperator(a: Registry, by: str): bool = O::isOperator(a.ops, by)

pure def stepPrivilegedChangesAreAudited(before: Registry, via: str, after: Registry): bool =
  if (after.audit.length() == before.audit.length()) true
  else if (after.audit.length() > before.audit.length())
    (before.ops.roster.length() == 0 or
     before.ops.roster.some(o => o.wallet == after.audit.nth(after.audit.length() - 1).actor))
  else false
```

### Accounts are registered once

A workspace appears in the registry the first time it is seen, Active with
no usage, and no account is registered twice.

```quint
pure def registered(a: Registry, id: str): bool = a.records.some(r => r.id == id)

pure def canRegister(a: Registry, by: str, id: str, subject: Subject): bool =
  isOperator(a, by) and id != "" and not(registered(a, id))

pure def register(a: Registry, by: str, id: str, subject: Subject, at: int): Registry =
  { ...a,
    records: a.records.concat(List({ id: id, subject: subject, status: Active, usage: 0 })),
    audit: a.audit.concat(List({ at: at, actor: by, act: "account.register", target: id, summary: "Account registered" })) }
```

### Only an active account can be suspended

Suspending stops inference for the account; the record and its usage stay.

```quint
pure def canSuspend(a: Registry, by: str, id: str): bool =
  isOperator(a, by) and a.records.some(r => r.id == id and r.status == Active)

pure def suspend(a: Registry, by: str, id: str, at: int): Registry =
  { ...a,
    records: a.records.listMap(r => if (r.id == id and r.status == Active) { ...r, status: Suspended } else r),
    audit: a.audit.concat(List({ at: at, actor: by, act: "account.suspend", target: id, summary: "Inference access suspended" })) }
```

### Only a suspended account can be reinstated

```quint
pure def canReinstate(a: Registry, by: str, id: str): bool =
  isOperator(a, by) and a.records.some(r => r.id == id and r.status == Suspended)

pure def reinstate(a: Registry, by: str, id: str, at: int): Registry =
  { ...a,
    records: a.records.listMap(r => if (r.id == id and r.status == Suspended) { ...r, status: Active } else r),
    audit: a.audit.concat(List({ at: at, actor: by, act: "account.reinstate", target: id, summary: "Inference access restored" })) }
```

### A suspended account cannot accrue usage

Usage accrues only onto an Active account, so a suspended org — and a
suspended user — holds the usage it had.

```quint
pure def canAccrueUsage(a: Registry, by: str, id: str, amount: int): bool =
  isOperator(a, by) and amount > 0 and a.records.some(r => r.id == id and r.status == Active)

pure def accrueUsage(a: Registry, by: str, id: str, amount: int): Registry =
  { ...a,
    records: a.records.listMap(r => if (r.id == id and r.status == Active) { ...r, usage: r.usage + amount } else r) }



pure def alwaysUsageIsNotNegative(a: Registry): bool =
  a.records.every(r => r.usage >= 0)
```

### Suspending leaves the account reinstatable

Suspend an active account and the same operator can restore it.

```quint
pure def lawSuspendLeavesReinstatable(a: Registry, by: str, id: str, at: int): bool =
  not(canSuspend(a, by, id)) or canReinstate(suspend(a, by, id, at), by, id)
```

### An account can be suspended

```quint
pure def sometimesSuspended(a: Registry): bool =
  a.records.some(r => r.status == Suspended)
```

### A suspended account can come back

```quint
pure def sometimesReinstated(a: Registry): bool =
  a.audit.some(e => e.act == "account.reinstate")
```

### Operators can run the surface

```quint
pure def sometimesTwoOperators(a: Registry): bool =
  a.ops.roster.length() >= 2

pure def sometimesUsageAccrued(a: Registry): bool =
  a.records.some(r => r.usage > 0)
```
