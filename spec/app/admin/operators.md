# Operators

The operator directory: the wallets allowed to run the admin surface, with
the role each holds. Other admin machines import it as a component — it has
no state of its own, only the directory's shape, its two transitions and the
rules they keep.

## Domain

### Operator roles

Every wallet the deployment trusts has a role: `Admin` operators run every
admin transition, `Support` and `Finance` run their scoped workspaces, and a
`Member` wallet is a customer, not an operator.

```quint
type Role = Admin | Support | Finance | Member

type Operator = { wallet: str, role: Role }

type Directory = { roster: List[Operator] }

pure val empty: Directory = { roster: List() }

pure def isOperator(d: Directory, wallet: str): bool =
  d.roster.some(o => o.wallet == wallet)

pure val walletValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn", "4vMsoUT2BWatFweudnQM1xedRLKEJgM8v4z2o2o9c2d")

pure val byValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn")

pure val dValues = Set(
  empty,
  { roster: List({ wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", role: Admin }) },
  { roster: List(
      { wallet: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", role: Admin },
      { wallet: "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn", role: Support }) })

pure def roleOf(d: Directory, wallet: str): str =
  val found = d.roster.select(o => o.wallet == wallet)
  val role = if (found.length() == 0) Member else found.head().role
  match role { | Admin => "admin" | Support => "support" | Finance => "finance" | Member => "member" }
```

## Story: Grant and revoke access

> As an operator, I want to add and remove operator wallets and set their
> roles, so that access to the admin surface stays with the people who
> should have it.

### Only an operator can grant access

An empty directory appoints its first operator from whoever asks, so the
admin surface can always be opened; once the directory holds someone, only a
listed operator may grant.

```quint
pure def canGrant(d: Directory, by: str, wallet: str, role: Role): bool =
  by != "" and wallet != "" and (d.roster.length() == 0 or isOperator(d, by))

pure def grant(d: Directory, by: str, wallet: str, role: Role): Directory =
  if (isOperator(d, wallet))
    { roster: d.roster.listMap(o => if (o.wallet == wallet) { ...o, role: role } else o) }
  else
    { roster: d.roster.concat(List({ wallet: wallet, role: role })) }
```

### The last operator cannot be revoked

Revoking removes a listed wallet, but never the only operator left: with the
roster down to one, no one could grant access again.

```quint
pure def canRevoke(d: Directory, by: str, wallet: str): bool =
  by != "" and isOperator(d, by) and isOperator(d, wallet) and d.roster.length() > 1

pure def revoke(d: Directory, by: str, wallet: str): Directory =
  { roster: d.roster.select(o => o.wallet != wallet) }
```

### Granting keeps each wallet listed once

A grant for a wallet already on the roster changes its role instead of
listing it again.

```quint
pure def onceEach(roster: List[Operator]): bool =
  roster.every(o => roster.select(x => x.wallet == o.wallet).length() == 1)

pure def lawGrantKeepsEachWalletOnce(d: Directory, by: str, wallet: str, role: Role): bool =
  not(canGrant(d, by, wallet, role) and onceEach(d.roster)) or onceEach(grant(d, by, wallet, role).roster)
```

### Every grant and revoke checks the sender

No grant or revoke is allowed without a named sender, and once the roster
holds someone the sender must be on it.

```quint
pure def lawEveryChangeChecksTheSender(d: Directory, by: str, wallet: str, role: Role): bool =
  (canGrant(d, by, wallet, role) implies (by != "" and (d.roster.length() == 0 or isOperator(d, by)))) and
  (canRevoke(d, by, wallet) implies (by != "" and isOperator(d, by)))
```

### A revoke removes exactly that wallet

```quint
pure def lawRevokeRemovesTheWallet(d: Directory, by: str, wallet: str): bool =
  not(canRevoke(d, by, wallet) and onceEach(d.roster)) or
  (not(isOperator(revoke(d, by, wallet), wallet)) and
   revoke(d, by, wallet).roster.length() == d.roster.length() - 1)
```
