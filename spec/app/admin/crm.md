# CRM

The read shapes the admin views query: the customer directory, the audit
log and the support and traces rows. Nothing here keeps state — the admin
machine owns the registry and the audit trail, the other areas' machines own
the rest, and the shell joins them into these shapes for the console.

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
