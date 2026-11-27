# Teams

A team shares a wallet-scoped workspace: owners and admins manage members,
roles, pending invitations and project budgets. Membership is by wallet
address; roles are `owner`, `admin` and `member`. Invites name a wallet and a
role — never owner — and expire (the legacy product gives them seven days;
the model just keeps the deadline). A project carries a name, a monthly
budget in micro-USD, the amount spent so far, and an archived flag.

## Domain

### A team, its members, invites and projects

Budgets run $0.01 to $100,000 (10,000 to 100,000,000,000 micro-USD);
`spent` counts metered project spend and can exceed a lowered budget.
`expiresAt` is in milliseconds.

```quint
type Role = Owner | Admin | Member

type Membership = { wallet: str, role: Role }

type Invite = { wallet: str, role: Role, inviter: str, expiresAt: int }

type Project = { id: str, name: str, budget: int, spent: int, archived: bool }

type Team = { id: str, name: str, members: List[Membership], invites: List[Invite], projects: List[Project] }

type Teams = { teams: List[Team], releaseRefs: Set[str] }
```

### The directory starts empty

```quint
pure val initial: Teams = { teams: List(), releaseRefs: Set() }
```

```quint
pure def teamWithId(s: Teams, id: str): List[Team] = s.teams.select(t => t.id == id)

pure def memberRole(t: Team, wallet: str): List[Role] = t.members.select(m => m.wallet == wallet).listMap(m => m.role)

pure def manages(t: Team, wallet: str): bool = memberRole(t, wallet).some(r => r != Member)

pure def owns(t: Team, wallet: str): bool = memberRole(t, wallet).includes(Owner)

pure def teamOfProject(s: Teams, projectId: str): List[Team] = s.teams.select(t => t.projects.some(p => p.id == projectId))

pure def inviteOf(t: Team, wallet: str): List[Invite] = t.invites.select(i => i.wallet == wallet)

pure def membershipsOf(s: Teams, wallet: str): int =
  s.teams.foldl(0, (n, t) => n + t.members.select(m => m.wallet == wallet).length())

pure def budgetOk(budget: int): bool = budget >= 10000 and budget <= 100000000000

pure val idValues = Set("t1", "t2")
pure val teamIdValues = Set("t1", "t2")
pure val nameValues = Set("Team A", "Project X")
pure val actorValues = Set("w1", "w2", "w3")
pure val walletValues = Set("w1", "w2", "w3")
pure val roleValues = Set(Owner, Admin, Member)
pure val expiresAtValues = Set(0, 2000, 6000)
pure val nowValues = Set(0, 1000, 5000)
pure val projectIdValues = Set("p1", "p2")
pure val budgetValues = Set(0, 9999, 10000, 5000000, 100000000000)
pure val refValues = Set("r1", "r2")
```

## Story: Form a team

> As a wallet holder, I want to create a team I own, so that I can share a
> workspace with other wallets.

### A team starts with its creator as the sole owner

The name is nonempty — the product allows up to 60 characters; a wallet can
belong to at most 50 teams.

```quint
pure def canCreateTeam(s: Teams, id: str, name: str, actor: str, now: int): bool =
  id != "" and name != "" and actor != "" and now >= 0
  and s.teams.every(t => t.id != id)
  and membershipsOf(s, actor) < 50

pure def createTeam(s: Teams, id: str, name: str, actor: str, now: int): Teams =
  { ...s, teams: s.teams.append({
      id: id, name: name, members: List({ wallet: actor, role: Owner }), invites: List(), projects: List() }) }
```

### Every team keeps an owner and a finite role set

```quint
pure def alwaysTeamsAreWellFormed(s: Teams): bool =
  s.teams.every(t =>
    t.id != "" and t.name != ""
    and t.members.length() >= 1 and t.members.length() <= 50
    and t.members.every(m => m.wallet != "" and t.members.select(o => o.wallet == m.wallet).length() == 1)
    and t.members.some(m => m.role == Owner)
    and t.invites.every(i => i.wallet != "" and i.role != Owner and i.inviter != "" and i.expiresAt >= 0
                            and t.invites.select(o => o.wallet == i.wallet).length() == 1)
    and t.projects.every(p => p.id != "" and p.name != ""
                              and budgetOk(p.budget) and p.spent >= 0
                              and t.projects.select(o => o.id == p.id).length() == 1))
  and s.teams.every(t => s.teams.select(o => o.id == t.id).length() == 1)
  and s.teams.every(t => t.projects.every(p => teamOfProject(s, p.id).length() == 1))
```

## Story: Invite and join

> As an owner or admin, I want to invite a wallet to a role, so that when
> the wallet accepts it joins the team — an invite can be used only once.

### An owner or admin can invite; only an owner may offer admin

An invitation needs a wallet that is not already a member and a future
deadline; a pending invite to the same wallet for the admin role can be
replaced only by an owner. A team holds at most 50 open invites.

```quint
pure def canInvite(s: Teams, teamId: str, actor: str, wallet: str, role: Role, expiresAt: int, now: int): bool =
  wallet != "" and role != Owner and expiresAt > now and now >= 0
  and teamWithId(s, teamId).some(t =>
       manages(t, actor)
       and (role != Admin or owns(t, actor))
       and t.members.every(m => m.wallet != wallet)
       and inviteOf(t, wallet).every(i => i.role != Admin or owns(t, actor))
       and t.invites.select(i => i.expiresAt > now).length() < 50)

pure def invite(s: Teams, teamId: str, actor: str, wallet: str, role: Role, expiresAt: int, now: int): Teams =
  { ...s, teams: s.teams.listMap(t =>
      if (t.id == teamId)
        { ...t, invites: t.invites.select(i => i.wallet != wallet)
                         .append({ wallet: wallet, role: role, inviter: actor, expiresAt: expiresAt }) }
      else t) }
```

### An invite is answered once — accept joins, decline voids

Answering needs a wallet that is not already a member and a live (unexpired)
invite whose issuer is still an owner or admin — and an owner if the
offered role is admin. Accepting joins the team within the 50-team and
50-member limits; either way the invite is consumed.

```quint
pure def canRespond(s: Teams, teamId: str, actor: str, accept: bool, now: int): bool =
  actor != "" and now >= 0
  and teamWithId(s, teamId).some(t =>
       t.members.every(m => m.wallet != actor)
       and inviteOf(t, actor).some(i =>
         i.expiresAt > now
         and memberRole(t, i.inviter).some(r => r != Member and (i.role != Admin or r == Owner))
         and (not(accept) or (t.members.length() < 50 and membershipsOf(s, actor) < 50))))

pure def respond(s: Teams, teamId: str, actor: str, accept: bool, now: int): Teams =
  { ...s, teams: s.teams.listMap(t =>
      if (t.id != teamId) t
      else if (inviteOf(t, actor).length() == 0) t
      else {
        ...t,
        invites: t.invites.select(i => i.wallet != actor),
        members: if (accept) t.members.append({ wallet: actor, role: inviteOf(t, actor).head().role }) else t.members,
      }) }
```

### A pending invite can be cancelled

A manager can cancel member-role invites; cancelling an admin invite needs
an owner.

```quint
pure def canCancelInvite(s: Teams, teamId: str, actor: str, wallet: str): bool =
  teamWithId(s, teamId).some(t =>
    manages(t, actor)
    and inviteOf(t, wallet).some(i => i.role != Admin or owns(t, actor)))

pure def cancelInvite(s: Teams, teamId: str, actor: str, wallet: str): Teams =
  { ...s, teams: s.teams.listMap(t =>
      if (t.id == teamId) { ...t, invites: t.invites.select(i => i.wallet != wallet) } else t) }
```

### An answered invite is gone

```quint
pure def stepRespondConsumesTheInvite(before: Teams, via: str, after: Teams): bool =
  via != "respond"
  or before.teams.every(t =>
       teamWithId(after, t.id).every(a =>
         a.invites.every(i => t.invites.some(o => o.wallet == i.wallet and o.role == i.role and o.inviter == i.inviter))
         and a.members.length() <= t.members.length() + 1))
```

### An invitation can be accepted

```quint
pure def sometimesTwoMembers(s: Teams): bool = s.teams.some(t => t.members.length() >= 2)

pure def sometimesPendingInvite(s: Teams): bool = s.teams.some(t => t.invites.length() >= 1)
```

### An invite can be used only once

```quint
pure def lawAnsweringTwiceIsImpossible(s: Teams, id: str, name: str, actor: str, wallet: str, role: Role, expiresAt: int, accept: bool, now: int): bool =
  val t1 = createTeam(s, id, name, actor, now)
  val t2 = invite(t1, id, actor, wallet, role, expiresAt, now)
  val t3 = respond(t2, id, wallet, accept, now)
  s.teams.some(t => t.id == id) or not(canRespond(t3, id, wallet, accept, now))
```

### A member cannot invite

```quint
pure def lawMemberCannotInvite(s: Teams, id: str, name: str, actor: str, wallet: str, role: Role, expiresAt: int, now: int): bool =
  val t1 = createTeam(s, id, name, actor, now)
  val t2 = invite(t1, id, actor, wallet, Member, expiresAt, now)
  val t3 = respond(t2, id, wallet, true, now)
  s.teams.some(t => t.id == id) or actor == wallet
  or not(canInvite(t3, id, wallet, actor, role, expiresAt, now))
```

## Story: Manage members

> As an owner, I want to change roles and remove members; as a member, I
> want to leave — without ever leaving a team with no owner.

### Only an owner can grant a role below owner

Ownership never moves through this transition; the target must already be a
member who is not an owner.

```quint
pure def canChangeRole(s: Teams, teamId: str, actor: str, wallet: str, role: Role): bool =
  role != Owner and wallet != ""
  and teamWithId(s, teamId).some(t =>
       owns(t, actor)
       and memberRole(t, wallet).some(r => r != Owner))

pure def changeRole(s: Teams, teamId: str, actor: str, wallet: str, role: Role): Teams =
  { ...s, teams: s.teams.listMap(t =>
      if (t.id == teamId)
        { ...t, members: t.members.listMap(m => if (m.wallet == wallet) { ...m, role: role } else m) }
      else t) }
```

### Members can leave; an owner can remove anyone but an owner

A member removes itself; a non-owner admin removes member-role wallets;
removing an admin or another member's role needs an owner — and an owner is
never removable.

```quint
pure def canRemoveMember(s: Teams, teamId: str, actor: str, wallet: str): bool =
  teamWithId(s, teamId).some(t =>
    memberRole(t, wallet).some(target =>
      target != Owner
      and (actor == wallet or owns(t, actor) or (target == Member and memberRole(t, actor).includes(Admin)))))

pure def removeMember(s: Teams, teamId: str, actor: str, wallet: str): Teams =
  { ...s, teams: s.teams.listMap(t =>
      if (t.id == teamId) { ...t, members: t.members.select(m => m.wallet != wallet) } else t) }
```

### A team's owner survives every transition

```quint
pure def stepOwnersSurvive(before: Teams, after: Teams): bool =
  before.teams.every(t =>
    teamWithId(after, t.id).every(a =>
      not(t.members.some(m => m.role == Owner)) or a.members.some(m => m.role == Owner)))
```

### The sole owner cannot be removed or demoted

```quint
pure def lawSoleOwnerStays(s: Teams, id: str, name: str, actor: str, role: Role, now: int): bool =
  val t1 = createTeam(s, id, name, actor, now)
  s.teams.some(t => t.id == id)
  or (not(canRemoveMember(t1, id, actor, actor)) and not(canChangeRole(t1, id, actor, actor, role)))
```

## Story: Budget a project

> As an owner or admin, I want to create a project with a monthly budget,
> rename it or change its budget, and archive it, so that project spend is
> tracked against a limit.

### A manager can create a project with a valid budget

A project name is nonempty — the product allows up to 60 characters;
project ids are unique across all teams; a team holds at most 50 active
projects.

```quint
pure def canCreateProject(s: Teams, teamId: str, projectId: str, actor: str, name: str, budget: int): bool =
  projectId != "" and name != "" and budgetOk(budget)
  and s.teams.every(t => t.projects.every(p => p.id != projectId))
  and teamWithId(s, teamId).some(t =>
       manages(t, actor) and t.projects.select(p => not(p.archived)).length() < 50)

pure def createProject(s: Teams, teamId: str, projectId: str, actor: str, name: str, budget: int): Teams =
  { ...s, teams: s.teams.listMap(t =>
      if (t.id == teamId)
        { ...t, projects: t.projects.append({ id: projectId, name: name, budget: budget, spent: 0, archived: false }) }
      else t) }
```

### A manager can update or archive a live project

```quint
pure def canUpdateProject(s: Teams, projectId: str, actor: str, name: str, budget: int): bool =
  name != "" and budgetOk(budget)
  and teamOfProject(s, projectId).some(t =>
       manages(t, actor) and t.projects.every(p => p.id != projectId or not(p.archived)))

pure def updateProject(s: Teams, projectId: str, actor: str, name: str, budget: int): Teams =
  { ...s, teams: s.teams.listMap(t =>
      { ...t, projects: t.projects.listMap(p =>
          if (p.id == projectId) { ...p, name: name, budget: budget } else p) }) }

pure def canArchiveProject(s: Teams, projectId: str, actor: str): bool =
  teamOfProject(s, projectId).some(t => manages(t, actor))

pure def archiveProject(s: Teams, projectId: str, actor: str): Teams =
  { ...s, teams: s.teams.listMap(t =>
      { ...t, projects: t.projects.listMap(p =>
          if (p.id == projectId) { ...p, archived: true } else p) }) }
```

### A live project holds each reservation inside its budget

`spent` counts final charges together with reservations still in flight.
Holding a reservation raises it before the request starts, so concurrent
requests cannot together cross the project's budget. An archived project
takes no new hold.

```quint
pure def canHoldProject(s: Teams, projectId: str, amount: int): bool =
  amount > 0 and teamOfProject(s, projectId).some(t =>
    t.projects.some(p => p.id == projectId and not(p.archived) and p.spent + amount <= p.budget))

pure def holdProject(s: Teams, projectId: str, amount: int): Teams =
  { ...s, teams: s.teams.listMap(t =>
      { ...t, projects: t.projects.listMap(p =>
          if (p.id == projectId) { ...p, spent: p.spent + amount } else p) }) }
```

### Settling or releasing a reservation returns what it did not spend

The unused part of a reservation leaves `spent`; the final charge remains.
Existing holds may settle after archival, so this transition does not ask
whether the project is live. Every release carries the reference of the
reservation it compensates; the directory records that reference, so a retry
of the same release is accepted as a no-op rather than returning the amount
twice.

```quint
pure def canReleaseProject(s: Teams, projectId: str, amount: int, ref: str): bool =
  amount > 0 and ref != ""
  and (s.releaseRefs.contains(ref) or teamOfProject(s, projectId).some(t =>
    t.projects.some(p => p.id == projectId and p.spent >= amount)))

pure def releaseProject(s: Teams, projectId: str, amount: int, ref: str): Teams =
  if (s.releaseRefs.contains(ref)) s
  else {
    ...s,
    teams: s.teams.listMap(t =>
      { ...t, projects: t.projects.listMap(p =>
          if (p.id == projectId) { ...p, spent: p.spent - amount } else p) }),
    releaseRefs: s.releaseRefs.union(Set(ref))
  }
```


### A project can be created and archived

```quint
pure def sometimesProjectExists(s: Teams): bool = s.teams.some(t => t.projects.length() >= 1)

pure def sometimesArchived(s: Teams): bool = s.teams.some(t => t.projects.some(p => p.archived))

pure def sometimesProjectSpend(s: Teams): bool = s.teams.some(t => t.projects.some(p => p.spent > 0))
```
