# CRM

The CRM machine owns customer-relationship state: identity and onboarding
metadata operators need beside the account registry, internal activity,
follow-ups, flags, saved directory views and audited balance-adjustment
records. The admin machine still owns moderation and the audit trail, the
other areas' machines own billing, usage and support, and the shell joins
them into the customer directory, audit log and trace rows the console
shows.

## Domain

### Customer rows

A row of the customer directory, joined across stores: the account's
identity and role, its credit balance, whether it funded and is active, and
the flags an operator attached (`funded`, `flagged`, `high_risk`,
`suspended`, …).

```quint
type Customer = {
  id: str,
  wallet: str,
  name: str,
  username: str,
  joined: int,
  balance: int,
  role: str,
  funded: bool,
  active: bool,
  flags: List[str]
}
```

### Audit entries

An entry in the shared audit log: when it happened, the wallet that acted,
the action, the target and a one-line summary.

```quint
type Audit = { at: int, actor: str, act: str, target: str, summary: str }

pure val customersValues = Set(
  List(),
  List({ id: "acct-a", wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", name: "Aster", username: "aster", joined: 1, balance: 1000, role: "owner", funded: true, active: true, flags: List("funded") }),
  List(
    { id: "acct-a", wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", name: "Aster", username: "aster", joined: 1, balance: 1000, role: "owner", funded: true, active: true, flags: List("funded") },
    { id: "acct-b", wallet: "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn", name: "Blake", username: "blake", joined: 2, balance: 0, role: "member", funded: false, active: false, flags: List("flagged") }))

pure val entriesValues = Set(
  List(),
  List({ at: 1, actor: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", act: "account.suspend", target: "acct-a", summary: "Inference access suspended" }))
```


## Story: Keep customer relationship state

> As an operator, I want customer relationship metadata and work items kept
> with the customer record, so that the console's memory does not depend on
> one browser.

### Customer profiles are keyed by wallet

A profile carries the customer's display identity and lifecycle metadata.
Empty `name`, `username`, `termsVersion` and `inviter` mean unknown or unset;
`joined` and `termsAcceptedAt` are milliseconds, with `0` meaning unknown or
unset. `onboarding` is empty, `pending`, `fund` or `later`. Saving a profile
upserts the one row for its wallet.

```quint
type CustomerProfile = {
  wallet: str,
  name: str,
  username: str,
  joined: int,
  onboarding: str,
  termsVersion: str,
  termsAcceptedAt: int,
  inviter: str,
  updatedAt: int,
}

pure def profileRows(s: Crm, wallet: str): List[CustomerProfile] =
  s.profiles.select(p => p.wallet == wallet)

pure def onboardingOk(onboarding: str): bool =
  onboarding == "" or onboarding == "pending" or onboarding == "fund" or onboarding == "later"

pure def canSaveProfile(s: Crm, wallet: str, name: str, username: str, joined: int, onboarding: str, termsVersion: str, termsAcceptedAt: int, inviter: str, now: int): bool =
  wallet != "" and joined >= 0 and termsAcceptedAt >= 0 and now >= 0
  and onboardingOk(onboarding)
  and (termsAcceptedAt == 0 or termsVersion != "")

pure def saveProfile(s: Crm, wallet: str, name: str, username: str, joined: int, onboarding: str, termsVersion: str, termsAcceptedAt: int, inviter: str, now: int): Crm =
  val row = { wallet: wallet, name: name, username: username, joined: joined, onboarding: onboarding, termsVersion: termsVersion, termsAcceptedAt: termsAcceptedAt, inviter: inviter, updatedAt: now }
  { ...s, profiles:
      if (profileRows(s, wallet).length() == 0) s.profiles.append(row)
      else s.profiles.listMap(p => if (p.wallet == wallet) row else p) }
```

### The CRM tables start empty

Activities are the customer-timeline entries operators create. A follow-up
uses `0` for an unset `dueAt` or `doneAt`; a flag's empty `note` means no
operator note; a segment belongs to the operator who saved it; an adjustment
is the audited record of a balance change whose `balanceAfter` the shell
computes from the balance it read.

```quint
type CrmActivity = { id: str, account: str, actor: str, ticket: str, kind: str, note: str, time: int }

type FollowUp = {
  id: str,
  account: str,
  assignee: str,
  creator: str,
  title: str,
  dueAt: int,
  doneAt: int,
  createdAt: int,
}

type AccountFlag = { account: str, flag: str, note: str, admin: str, createdAt: int }

type SavedSegment = { id: str, admin: str, name: str, definition: str, createdAt: int }

type BalanceAdjustment = { id: str, account: str, admin: str, delta: int, reason: str, balanceAfter: int, time: int }

type Crm = {
  profiles: List[CustomerProfile],
  activities: List[CrmActivity],
  tasks: List[FollowUp],
  flags: List[AccountFlag],
  segments: List[SavedSegment],
  adjustments: List[BalanceAdjustment],
}

pure val initial: Crm = { profiles: List(), activities: List(), tasks: List(), flags: List(), segments: List(), adjustments: List() }

pure def activityWith(s: Crm, id: str): List[CrmActivity] = s.activities.select(a => a.id == id)
pure def taskWith(s: Crm, id: str): List[FollowUp] = s.tasks.select(t => t.id == id)
pure def segmentWith(s: Crm, id: str): List[SavedSegment] = s.segments.select(v => v.id == id)
pure def adjustmentWith(s: Crm, id: str): List[BalanceAdjustment] = s.adjustments.select(a => a.id == id)
pure def flagRows(s: Crm, account: str, flag: str): List[AccountFlag] =
  s.flags.select(f => f.account == account and f.flag == flag)

pure val accountValues = Set("a", "b")
pure val actorValues = Set("op", "w2")
pure val adminValues = Set("op", "w2")
pure val assigneeValues = Set("op", "w2")
pure val creatorValues = Set("op", "w2")
pure val idValues = Set("r1", "r2")
pure val activityIdValues = Set("e1", "e2")
pure val noteValues = Set("n1", "n2")
pure val summaryValues = Set("s1", "s2")
pure val titleValues = Set("t1", "t2")
pure val flagValues = Set("f1", "f2")
pure val nameValues = Set("n", "m")
pure val usernameValues = Set("", "u")
pure val onboardingValues = Set("", "pending", "fund", "later")
pure val termsVersionValues = Set("", "v1")
pure val inviterValues = Set("", "a")
pure val definitionValues = Set("d1", "d2")
pure val reasonValues = Set("r1", "r2")
pure val dueAtValues = Set(0, 2000)
pure val balanceBeforeValues = Set(0, 1000)
pure val deltaValues = Set(0 - 100, 100)
pure val nowValues = Set(0, 1000, 5000)
```

### An internal note is appended once

```quint
pure def canAddNote(s: Crm, id: str, account: str, actor: str, note: str, now: int): bool =
  id != "" and account != "" and actor != "" and note != "" and now >= 0
  and activityWith(s, id).length() == 0

pure def addNote(s: Crm, id: str, account: str, actor: str, note: str, now: int): Crm =
  { ...s, activities: s.activities.append({ id: id, account: account, actor: actor, ticket: "", kind: "note", note: note, time: now }) }
```

### A follow-up is created, completed and reopened without losing it

```quint
pure def canCreateTask(s: Crm, id: str, activityId: str, account: str, assignee: str, creator: str, title: str, dueAt: int, summary: str, now: int): bool =
  id != "" and activityId != "" and account != "" and assignee != "" and creator != "" and title != "" and summary != ""
  and dueAt >= 0 and now >= 0
  and taskWith(s, id).length() == 0 and activityWith(s, activityId).length() == 0

pure def createTask(s: Crm, id: str, activityId: str, account: str, assignee: str, creator: str, title: str, dueAt: int, summary: str, now: int): Crm =
  { ...s,
    tasks: s.tasks.append({ id: id, account: account, assignee: assignee, creator: creator, title: title, dueAt: dueAt, doneAt: 0, createdAt: now }),
    activities: s.activities.append({ id: activityId, account: account, actor: creator, ticket: "", kind: "task", note: summary, time: now }) }

pure def canCompleteTask(s: Crm, id: str, now: int): bool =
  now >= 0 and taskWith(s, id).length() == 1

pure def completeTask(s: Crm, id: str, now: int): Crm =
  { ...s, tasks: s.tasks.listMap(t => if (t.id == id and t.doneAt == 0) { ...t, doneAt: now } else t) }

pure def canReopenTask(s: Crm, id: str): bool = taskWith(s, id).length() == 1

pure def reopenTask(s: Crm, id: str): Crm =
  { ...s, tasks: s.tasks.listMap(t => if (t.id == id) { ...t, doneAt: 0 } else t) }
```

### Flags are one row per customer and flag

Setting an existing flag updates its note and operator; removing it deletes
that row. Both actions leave a customer-timeline entry.

```quint
pure def canSetFlag(s: Crm, activityId: str, account: str, flag: str, note: str, admin: str, summary: str, now: int): bool =
  activityId != "" and account != "" and flag != "" and admin != "" and summary != "" and now >= 0
  and activityWith(s, activityId).length() == 0

pure def setFlag(s: Crm, activityId: str, account: str, flag: str, note: str, admin: str, summary: str, now: int): Crm =
  val row = { account: account, flag: flag, note: note, admin: admin, createdAt: now }
  { ...s,
    flags: if (flagRows(s, account, flag).length() == 0) s.flags.append(row)
           else s.flags.listMap(f => if (f.account == account and f.flag == flag) row else f),
    activities: s.activities.append({ id: activityId, account: account, actor: admin, ticket: "", kind: "flag", note: summary, time: now }) }

pure def canRemoveFlag(s: Crm, activityId: str, account: str, flag: str, admin: str, summary: str, now: int): bool =
  activityId != "" and account != "" and flag != "" and admin != "" and summary != "" and now >= 0
  and flagRows(s, account, flag).length() >= 1
  and activityWith(s, activityId).length() == 0

pure def removeFlag(s: Crm, activityId: str, account: str, flag: str, admin: str, summary: str, now: int): Crm =
  { ...s,
    flags: s.flags.select(f => not(f.account == account and f.flag == flag)),
    activities: s.activities.append({ id: activityId, account: account, actor: admin, ticket: "", kind: "flag", note: summary, time: now }) }
```

### Saved views belong to their operator

```quint
pure def canSaveSegment(s: Crm, id: str, admin: str, name: str, definition: str, now: int): bool =
  id != "" and admin != "" and name != "" and definition != "" and now >= 0
  and segmentWith(s, id).length() == 0

pure def saveSegment(s: Crm, id: str, admin: str, name: str, definition: str, now: int): Crm =
  { ...s, segments: s.segments.append({ id: id, admin: admin, name: name, definition: definition, createdAt: now }) }

pure def canDeleteSegment(s: Crm, id: str, admin: str): bool =
  id != "" and admin != "" and s.segments.some(v => v.id == id and v.admin == admin)

pure def deleteSegment(s: Crm, id: str, admin: str): Crm =
  { ...s, segments: s.segments.select(v => not(v.id == id and v.admin == admin)) }
```

### A balance adjustment is recorded without overdrawing the balance read

```quint
pure def canRecordAdjustment(s: Crm, id: str, activityId: str, account: str, admin: str, delta: int, reason: str, balanceBefore: int, summary: str, now: int): bool =
  id != "" and activityId != "" and account != "" and admin != "" and reason != "" and summary != ""
  and delta != 0 and balanceBefore >= 0 and balanceBefore + delta >= 0 and now >= 0
  and adjustmentWith(s, id).length() == 0 and activityWith(s, activityId).length() == 0

pure def recordAdjustment(s: Crm, id: str, activityId: str, account: str, admin: str, delta: int, reason: str, balanceBefore: int, summary: str, now: int): Crm =
  { ...s,
    adjustments: s.adjustments.append({ id: id, account: account, admin: admin, delta: delta, reason: reason, balanceAfter: balanceBefore + delta, time: now }),
    activities: s.activities.append({ id: activityId, account: account, actor: admin, ticket: "", kind: "adjust", note: summary, time: now }) }
```

### Relationship work is reachable

```quint
pure def sometimesProfile(s: Crm): bool = s.profiles.some(p => p.wallet != "")
pure def sometimesNote(s: Crm): bool = s.activities.some(a => a.kind == "note")
pure def sometimesDoneTask(s: Crm): bool = s.tasks.some(t => t.doneAt != 0)
pure def sometimesFlagged(s: Crm): bool = s.flags.some(f => f.flag != "")
pure def sometimesSegment(s: Crm): bool = s.segments.some(v => v.id != "")
pure def sometimesAdjusted(s: Crm): bool = s.adjustments.some(a => a.delta != 0)
```

## Story: Review customers

> As an operator, I want to search, filter and sort the customer directory,
> so that I can find the accounts that need attention.

### A filtered list only shows matching customers

The directory lists the customers that answer the search — a wallet, a
username or a name — and the filters that are set.

```quint
pure def matches(c: Customer, search: str): bool =
  search == "" or c.wallet == search or c.username == search or c.name == search

pure def listed(customers: List[Customer], search: str, flag: str, funded: str, activeOnly: bool): List[Customer] =
  customers.select(c =>
    matches(c, search) and
    (flag == "" or c.flags.includes(flag)) and
    (funded == "any" or (funded == "funded") == c.funded) and
    (not(activeOnly) or c.active))

pure def lawListedRowsMatch(customers: List[Customer], search: str, flag: str, funded: str, activeOnly: bool): bool =
  listed(customers, search, flag, funded, activeOnly).every(c =>
    matches(c, search) and
    (flag == "" or c.flags.includes(flag)) and
    (funded == "any" or (funded == "funded") == c.funded) and
    (not(activeOnly) or c.active))
```

### The flag list answers the directory

The flag list dedupes what customers carry, once each; and filtering by a
flag finds every customer that carries it.

```quint
pure def knownFlags(customers: List[Customer]): List[str] =
  customers.foldl(List(), (acc, c) =>
    c.flags.foldl(acc, (seen, f) => if (seen.includes(f)) seen else seen.concat(List(f))))

pure def lawFlagSearchFindsEveryCarrier(customers: List[Customer]): bool =
  customers.every(c => c.flags.every(f => listed(customers, "", f, "any", false).includes(c)))
```

### Filtering never adds a customer

```quint
pure def lawListedRowsComeFromTheDirectory(customers: List[Customer], search: str, flag: str, funded: str, activeOnly: bool): bool =
  listed(customers, search, flag, funded, activeOnly).every(c => customers.includes(c))
```

## Story: Read the audit log

> As an operator, I want to page the audit log by action and actor, so that
> I can trace who changed what.

### The log answers its filters

```quint
pure def auditListed(entries: List[Audit], act: str, actor: str): List[Audit] =
  entries.select(e => (act == "" or e.act == act) and (actor == "" or e.actor == actor))

pure def lawAuditListedRowsMatch(entries: List[Audit], act: str, actor: str): bool =
  auditListed(entries, act, actor).every(e =>
    (act == "" or e.act == act) and (actor == "" or e.actor == actor))
```
