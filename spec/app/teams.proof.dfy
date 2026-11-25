// spec/app/teams.md, "Every team keeps an owner and a finite role set" and the step rules:
// the registry's filters as ProofLib.Filter, so the library's lemmas apply.

lemma wellP(s: Teams)
  ensures alwaysTeamsAreWellFormed(s) == (!((exists t :: t in s.teams && !((t.id != "") && (t.name != "") && (|t.members| >= 1) && (|t.members| <= 50) && !(exists m :: m in t.members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t.members)| == 1))) && (exists m :: m in t.members && m.role.Owner?) && !(exists i :: i in t.invites && !((i.wallet != "") && (!i.role.Owner?) && (i.inviter != "") && (i.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == i.wallet), t.invites)| == 1))) && !(exists p :: p in t.projects && !((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t.projects)| == 1)))))) && !((exists t :: t in s.teams && !((|ProofLib.Filter((o: Team) => (o.id == t.id), s.teams)| == 1)))) && !((exists t :: t in s.teams && !(!(exists p :: p in t.projects && !((|teamOfProject(s, p.id)| == 1)))))))
{
}

lemma teamWithIdAll(s: Teams, id: string)
  ensures forall a :: (a in teamWithId(s, id)) == (a in s.teams && (a.id == id))
{
  forall a ensures (a in teamWithId(s, id)) == (a in s.teams && (a.id == id)) {
    ProofLib.FilterMember((t: Team) => (t.id == id), s.teams, a);
  }
}

lemma teamOfProjectIs(s: Teams, projectId: string)
  ensures teamOfProject(s, projectId) == ProofLib.Filter((t: Team) => (exists p :: p in t.projects && (p.id == projectId)), s.teams)
{
}

lemma inviteOfIs(t: Team, wallet: string)
  ensures inviteOf(t, wallet) == ProofLib.Filter((i: Invite) => (i.wallet == wallet), t.invites)
{
}

// A literal passed to Seq.Filter and the same literal passed to ProofLib.Filter are
// different function values to the verifier, so the seqs they return cannot be equated
// directly. Going element by element, they keep the same entries.

lemma seqFilterIsFilter<T>(f: T ~> bool, g: T -> bool, xs: seq<T>)
  requires forall y :: y in xs ==> (f.requires(y) && (f(y) == g(y)))
  ensures Std.Collections.Seq.Filter(f, xs) == ProofLib.Filter(g, xs)
  decreases |xs|
{
  reveal Std.Collections.Seq.Filter();
  if |xs| > 0 {
    seqFilterIsFilter(f, g, xs[1..]);
    ProofLib.FilterCons(g, xs);
    assert f(xs[0]) == g(xs[0]);
  } else {
    ProofLib.FilterNil(g, xs);
  }
}

lemma inviteDropIs(xs: seq<Invite>, wallet: string)
  ensures Std.Collections.Seq.Filter((i: Invite) => (i.wallet != wallet), xs) == ProofLib.Filter((i: Invite) => (i.wallet != wallet), xs)
{
  seqFilterIsFilter((i: Invite) => (i.wallet != wallet), (i: Invite) => (i.wallet != wallet), xs);
}

lemma memberDropIs(xs: seq<Membership>, wallet: string)
  ensures Std.Collections.Seq.Filter((m: Membership) => (m.wallet != wallet), xs) == ProofLib.Filter((m: Membership) => (m.wallet != wallet), xs)
{
  seqFilterIsFilter((m: Membership) => (m.wallet != wallet), (m: Membership) => (m.wallet != wallet), xs);
}

lemma memberFilterIs(xs: seq<Membership>, wallet: string)
  ensures Std.Collections.Seq.Filter((m: Membership) => (m.wallet == wallet), xs) == ProofLib.Filter((m: Membership) => (m.wallet == wallet), xs)
{
  seqFilterIsFilter((m: Membership) => (m.wallet == wallet), (m: Membership) => (m.wallet == wallet), xs);
}

lemma memberRoleAll(t: Team, wallet: string)
  ensures forall r :: (r in memberRole(t, wallet)) <==> (exists m :: m in t.members && (m.wallet == wallet) && (m.role == r))
{
  var F := Std.Collections.Seq.Filter((m: Membership) => (m.wallet == wallet), t.members);
  memberFilterIs(t.members, wallet);
  forall r ensures (r in memberRole(t, wallet)) <==> (exists m :: m in t.members && (m.wallet == wallet) && (m.role == r)) {
    if r in memberRole(t, wallet) {
      var i :| 0 <= i < |memberRole(t, wallet)| && memberRole(t, wallet)[i] == r;
      assert memberRole(t, wallet)[i] == F[i].role;
      ProofLib.FilterMember((m: Membership) => (m.wallet == wallet), t.members, F[i]);
    }
    if exists m :: m in t.members && (m.wallet == wallet) && (m.role == r) {
      var m :| m in t.members && (m.wallet == wallet) && (m.role == r);
      ProofLib.FilterMember((m: Membership) => (m.wallet == wallet), t.members, m);
      var j :| 0 <= j < |F| && F[j] == m;
      assert memberRole(t, wallet)[j] == m.role;
      assert r in memberRole(t, wallet);
    }
  }
}

lemma sameTeamIsSame(s: Teams, a: Team, b: Team)
  requires alwaysTeamsAreWellFormed(s)
  requires a in s.teams && b in s.teams && (a.id == b.id)
  ensures a == b
{
  wellP(s);
  ProofLib.FilterMember((o: Team) => (o.id == a.id), s.teams, a);
  ProofLib.FilterMember((o: Team) => (o.id == a.id), s.teams, b);
  assert a == ProofLib.Filter((o: Team) => (o.id == a.id), s.teams)[0];
  assert b == ProofLib.Filter((o: Team) => (o.id == a.id), s.teams)[0];
}

// Filtering an invite or member list by a different wallet keeps every element a
// wallet-equality filter would keep, so the before and after counts agree.

lemma filterWhenImplies<T>(p: T -> bool, q: T -> bool, xs: seq<T>)
  requires forall i :: 0 <= i < |xs| ==> (p(xs[i]) ==> q(xs[i]))
  ensures ProofLib.Filter(p, ProofLib.Filter(q, xs)) == ProofLib.Filter(p, xs)
  decreases |xs|
{
  if |xs| == 0 {
    ProofLib.FilterNil(p, xs);
    ProofLib.FilterNil(q, xs);
    ProofLib.FilterNil(p, ProofLib.Filter(q, xs));
  } else {
    ProofLib.FilterCons(q, xs);
    ProofLib.FilterCons(p, xs);
    filterWhenImplies(p, q, xs[1..]);
    var rest := ProofLib.Filter(q, xs[1..]);
    assert ProofLib.Filter(q, xs) == (if q(xs[0]) then [xs[0]] else []) + rest;
    if q(xs[0]) {
      ProofLib.FilterCons(p, [xs[0]] + rest);
      assert ([xs[0]] + rest)[0] == xs[0];
      assert ([xs[0]] + rest)[1..] == rest;
    } else {
      assert !p(xs[0]);
      assert ProofLib.Filter(q, xs) == rest;
    }
  }
}

lemma teamIdsUniqueAfter(s: Teams, after: Teams)
  requires !(exists t :: t in s.teams && !((|ProofLib.Filter((o: Team) => (o.id == t.id), s.teams)| == 1)))
  requires |after.teams| == |s.teams|
  requires forall j :: 0 <= j < |s.teams| ==> (after.teams[j].id == s.teams[j].id)
  ensures !(exists t :: t in after.teams && !((|ProofLib.Filter((o: Team) => (o.id == t.id), after.teams)| == 1)))
{
  forall i | 0 <= i < |after.teams|
    ensures |ProofLib.Filter((o: Team) => (o.id == after.teams[i].id), after.teams)| == 1
  {
    assert after.teams[i].id == s.teams[i].id;
    ProofLib.FilterLengthPointwise((o: Team) => (o.id == s.teams[i].id), (o: Team) => (o.id == s.teams[i].id), s.teams, after.teams);
    ProofLib.FilterSamePredicate((o: Team) => (o.id == s.teams[i].id), (o: Team) => (o.id == after.teams[i].id), after.teams);
  }
}

lemma projectOwnerCountSame(s: Teams, after: Teams, pp_id: string)
  requires |after.teams| == |s.teams|
  requires forall j :: 0 <= j < |s.teams| ==> ((exists p :: p in s.teams[j].projects && (p.id == pp_id)) <==> (exists p :: p in after.teams[j].projects && (p.id == pp_id)))
  ensures |ProofLib.Filter((t: Team) => (exists p :: p in t.projects && (p.id == pp_id)), s.teams)| == |ProofLib.Filter((t: Team) => (exists p :: p in t.projects && (p.id == pp_id)), after.teams)|
{
  ProofLib.FilterLengthPointwise((t: Team) => (exists p :: p in t.projects && (p.id == pp_id)), (t: Team) => (exists p :: p in t.projects && (p.id == pp_id)), s.teams, after.teams);
}

// A directory map that appends n to the teamId team's projects and leaves the rest keeps an
// old project's owning-team count.

lemma countSameForOldProject(s: Teams, after: Teams, i: int, pp: Project, teamId: string, n: Project)
  requires 0 <= i < |s.teams|
  requires |after.teams| == |s.teams|
  requires pp in s.teams[i].projects
  requires pp.id != n.id
  requires forall j :: 0 <= j < |s.teams| ==> ((s.teams[j].id == teamId ==> after.teams[j].projects == s.teams[j].projects + [n]) && (s.teams[j].id != teamId ==> after.teams[j] == s.teams[j]))
  ensures |ProofLib.Filter((t: Team) => (exists p :: p in t.projects && (p.id == pp.id)), s.teams)| == |ProofLib.Filter((t: Team) => (exists p :: p in t.projects && (p.id == pp.id)), after.teams)|
{
  forall j | 0 <= j < |s.teams|
    ensures ((exists p :: p in s.teams[j].projects && (p.id == pp.id)) <==> (exists p :: p in after.teams[j].projects && (p.id == pp.id)))
  {
    if s.teams[j].id == teamId {
      assert after.teams[j].projects == s.teams[j].projects + [n];
      forall p | p in after.teams[j].projects && (p.id == pp.id)
        ensures p in s.teams[j].projects
      {
        assert p in s.teams[j].projects + [n];
        var k :| 0 <= k < |s.teams[j].projects + [n]| && (s.teams[j].projects + [n])[k] == p;
        if k == |s.teams[j].projects| {
          assert p == n;
          assert p.id == n.id;
          assert pp.id == n.id;
        } else {
          assert p == s.teams[j].projects[k];
        }
      }
    } else {
      assert after.teams[j] == s.teams[j];
    }
  }
  projectOwnerCountSame(s, after, pp.id);
}

// A transition that touches neither the team list's length, the team ids nor any team's
// project list keeps the per-project owning-team count.

lemma projectsRuleWhenUntouched(s: Teams, after: Teams)
  requires alwaysTeamsAreWellFormed(s)
  requires |after.teams| == |s.teams|
  requires forall j :: 0 <= j < |s.teams| ==> (after.teams[j].projects == s.teams[j].projects)
  ensures !(exists t :: t in after.teams && !(!((exists p :: p in t.projects && !((|teamOfProject(after, p.id)| == 1))))))
{
  wellP(s);
  forall i | 0 <= i < |after.teams|
    ensures !(exists pp :: pp in after.teams[i].projects && !((|teamOfProject(after, pp.id)| == 1)))
  {
    forall pp | pp in after.teams[i].projects
      ensures |teamOfProject(after, pp.id)| == 1
    {
      assert pp in s.teams[i].projects;
      teamOfProjectIs(s, pp.id);
      teamOfProjectIs(after, pp.id);
      projectOwnerCountSame(s, after, pp.id);
    }
  }
}

lemma projectsRuleWhenIdsKeep(s: Teams, after: Teams)
  requires alwaysTeamsAreWellFormed(s)
  requires |after.teams| == |s.teams|
  requires forall j :: 0 <= j < |s.teams| ==> (|after.teams[j].projects| == |s.teams[j].projects|) && (forall i :: 0 <= i < |s.teams[j].projects| ==> (after.teams[j].projects[i].id == s.teams[j].projects[i].id))
  ensures !(exists t :: t in after.teams && !(!((exists p :: p in t.projects && !((|teamOfProject(after, p.id)| == 1))))))
{
  wellP(s);
  forall i | 0 <= i < |after.teams|
    ensures !(exists pp :: pp in after.teams[i].projects && !((|teamOfProject(after, pp.id)| == 1)))
  {
    forall pp | pp in after.teams[i].projects
      ensures |teamOfProject(after, pp.id)| == 1
    {
      var k :| 0 <= k < |after.teams[i].projects| && after.teams[i].projects[k] == pp;
      assert s.teams[i].projects[k].id == pp.id;
      assert s.teams[i].projects[k] in s.teams[i].projects;
      teamOfProjectIs(s, pp.id);
      teamOfProjectIs(after, pp.id);
      forall j | 0 <= j < |s.teams|
        ensures ((exists p :: p in s.teams[j].projects && (p.id == pp.id)) <==> (exists p :: p in after.teams[j].projects && (p.id == pp.id)))
      {
        forall p | p in after.teams[j].projects
          ensures (p.id == pp.id) ==> (exists q :: q in s.teams[j].projects && (q.id == pp.id))
        {
          var n :| 0 <= n < |after.teams[j].projects| && after.teams[j].projects[n] == p;
        }
      }
      projectOwnerCountSame(s, after, pp.id);
    }
  }
}

// Piece1 of well-formedness: if every element of the directory passes the team predicate,
// no directory element fails it.

lemma piece1FromElems(after: Teams)
  requires forall i :: 0 <= i < |after.teams| ==> ((after.teams[i].id != "") && (after.teams[i].name != "") && (|after.teams[i].members| >= 1) && (|after.teams[i].members| <= 50) && !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1)))) && (exists m :: m in after.teams[i].members && m.role.Owner?) && !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1)))) && !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1)))))
  ensures !(exists t :: t in after.teams && !((t.id != "") && (t.name != "") && (|t.members| >= 1) && (|t.members| <= 50) && !(exists m :: m in t.members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t.members)| == 1))) && (exists m :: m in t.members && m.role.Owner?) && !(exists i :: i in t.invites && !((i.wallet != "") && (!i.role.Owner?) && (i.inviter != "") && (i.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == i.wallet), t.invites)| == 1))) && !(exists p :: p in t.projects && !((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t.projects)| == 1)))))
{
  forall t | t in after.teams
    ensures (t.id != "") && (t.name != "") && (|t.members| >= 1) && (|t.members| <= 50) && !(exists m :: m in t.members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t.members)| == 1))) && (exists m :: m in t.members && m.role.Owner?) && !(exists i :: i in t.invites && !((i.wallet != "") && (!i.role.Owner?) && (i.inviter != "") && (i.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == i.wallet), t.invites)| == 1))) && !(exists p :: p in t.projects && !((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t.projects)| == 1)))
  {
    var i :| 0 <= i < |after.teams| && after.teams[i] == t;
  }
}

// A transition whose map drops invites only from a same-wallet filter and adds at most one
// member keeps stepRespondConsumesTheInvite.

lemma respondStepPointwise(s: Teams, after: Teams)
  requires alwaysTeamsAreWellFormed(s)
  requires |after.teams| == |s.teams|
  requires forall j :: 0 <= j < |s.teams| ==> (after.teams[j].id == s.teams[j].id)
  requires forall j :: 0 <= j < |s.teams| ==> (forall i :: i in after.teams[j].invites ==> (exists o :: o in s.teams[j].invites && ((o.wallet == i.wallet) && (o.role == i.role) && (o.inviter == i.inviter))))
  requires forall j :: 0 <= j < |s.teams| ==> (|after.teams[j].members| <= (|s.teams[j].members| + 1))
  ensures stepRespondConsumesTheInvite(s, "respond", after)
{
  forall t | t in s.teams
    ensures !(exists a :: a in teamWithId(after, t.id) && !((!((exists i :: i in a.invites && !((exists o :: o in t.invites && (((o.wallet == i.wallet) && (o.role == i.role)) && (o.inviter == i.inviter)))))) && (|a.members| <= (|t.members| + 1)))))
  {
    forall a | a in teamWithId(after, t.id)
      ensures (!((exists i :: i in a.invites && !((exists o :: o in t.invites && (((o.wallet == i.wallet) && (o.role == i.role)) && (o.inviter == i.inviter)))))) && (|a.members| <= (|t.members| + 1)))
    {
      teamWithIdAll(after, t.id);
      var j :| 0 <= j < |after.teams| && after.teams[j] == a;
      assert s.teams[j].id == t.id;
      sameTeamIsSame(s, s.teams[j], t);
      assert a == after.teams[j];
      assert s.teams[j] == t;
      forall i | i in a.invites
        ensures exists o :: o in t.invites && ((o.wallet == i.wallet) && (o.role == i.role) && (o.inviter == i.inviter))
      {
      }
    }
  }
}

// A transition whose map keeps every owner's membership keeps stepOwnersSurvive.

lemma ownersSurvivePointwise(s: Teams, after: Teams)
  requires alwaysTeamsAreWellFormed(s)
  requires |after.teams| == |s.teams|
  requires forall j :: 0 <= j < |s.teams| ==> (after.teams[j].id == s.teams[j].id)
  requires forall j :: 0 <= j < |s.teams| ==> (forall m :: m in s.teams[j].members && m.role.Owner? ==> m in after.teams[j].members)
  ensures stepOwnersSurvive(s, after)
{
  forall t | t in s.teams
    ensures !(exists a :: a in teamWithId(after, t.id) && !(!((exists m :: m in t.members && m.role.Owner?)) || (exists m :: m in a.members && m.role.Owner?)))
  {
    forall a | a in teamWithId(after, t.id)
      ensures !((exists m :: m in t.members && m.role.Owner?)) || (exists m :: m in a.members && m.role.Owner?)
    {
      teamWithIdAll(after, t.id);
      var j :| 0 <= j < |after.teams| && after.teams[j] == a;
      assert after.teams[j].id == t.id;
      assert s.teams[j].id == t.id;
      sameTeamIsSame(s, s.teams[j], t);
      assert s.teams[j] == t;
      forall m | m in t.members && m.role.Owner?
        ensures m in a.members
      {
      }
    }
  }
}

// createTeam: the directory gains a one-owner team.

lemma createTeam_ensures(s: Teams, id: string, name: string, actor: string, now: int)
  ensures (inv(s) ==> canCreateTeam(s, id, name, actor, now) ==> alwaysTeamsAreWellFormed(createTeam(s, id, name, actor, now)))
  ensures (inv(s) ==> canCreateTeam(s, id, name, actor, now) ==> stepRespondConsumesTheInvite(s, "createTeam", createTeam(s, id, name, actor, now)))
  ensures (inv(s) ==> canCreateTeam(s, id, name, actor, now) ==> stepOwnersSurvive(s, createTeam(s, id, name, actor, now)))
{
  if inv(s) && canCreateTeam(s, id, name, actor, now) {
    var x := Team(id, name, [Membership(actor, Role.Owner)], [], []);
    var after := createTeam(s, id, name, actor, now);
    assert after.teams == s.teams + [x];
    wellP(s);
    forall t | t in after.teams
      ensures ((t.id != "") && (t.name != "") && (|t.members| >= 1) && (|t.members| <= 50) && !(exists m :: m in t.members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t.members)| == 1))) && (exists m :: m in t.members && m.role.Owner?) && !(exists i :: i in t.invites && !((i.wallet != "") && (!i.role.Owner?) && (i.inviter != "") && (i.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == i.wallet), t.invites)| == 1))) && !(exists p :: p in t.projects && !((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t.projects)| == 1))))
    {
      if t == x {
        forall m | m in t.members
          ensures (m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t.members)| == 1)
        {
          ProofLib.FilterCons((o: Membership) => (o.wallet == m.wallet), t.members);
          ProofLib.FilterNil((o: Membership) => (o.wallet == m.wallet), t.members[1..]);
        }
      }
    }
    piece1FromElems(after);
    forall t | t in after.teams
      ensures |ProofLib.Filter((o: Team) => (o.id == t.id), after.teams)| == 1
    {
      ProofLib.FilterAppend((o: Team) => (o.id == t.id), s.teams, x);
      if t == x {
        ProofLib.FilterNone((o: Team) => (o.id == t.id), s.teams);
      } else {
        assert t in s.teams;
      }
    }
    piece1FromElems(after);
    forall i | 0 <= i < |after.teams|
      ensures !(exists pp :: pp in after.teams[i].projects && !((|teamOfProject(after, pp.id)| == 1)))
    {
      forall pp | pp in after.teams[i].projects
        ensures |teamOfProject(after, pp.id)| == 1
      {
        assert i < |s.teams|;
        assert pp in s.teams[i].projects;
        teamOfProjectIs(s, pp.id);
        teamOfProjectIs(after, pp.id);
        ProofLib.FilterAppend((t: Team) => (exists p :: p in t.projects && (p.id == pp.id)), s.teams, x);
      }
    }
    piece1FromElems(after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    forall t | t in s.teams
      ensures !(exists a :: a in teamWithId(after, t.id) && !(!((exists m :: m in t.members && m.role.Owner?)) || (exists m :: m in a.members && m.role.Owner?)))
    {
      forall a | a in teamWithId(after, t.id)
        ensures !((exists m :: m in t.members && m.role.Owner?)) || (exists m :: m in a.members && m.role.Owner?)
      {
        teamWithIdAll(after, t.id);
        assert a in s.teams;
        sameTeamIsSame(s, a, t);
      }
    }
    assert stepOwnersSurvive(s, after);
  }
}

// invite: one team's pending invites gain an entry; everything else is untouched.

lemma invite_ensures(s: Teams, teamId: string, actor: string, wallet: string, role: Role, expiresAt: int, now: int)
  ensures (inv(s) ==> canInvite(s, teamId, actor, wallet, role, expiresAt, now) ==> alwaysTeamsAreWellFormed(invite(s, teamId, actor, wallet, role, expiresAt, now)))
  ensures (inv(s) ==> canInvite(s, teamId, actor, wallet, role, expiresAt, now) ==> stepRespondConsumesTheInvite(s, "invite", invite(s, teamId, actor, wallet, role, expiresAt, now)))
  ensures (inv(s) ==> canInvite(s, teamId, actor, wallet, role, expiresAt, now) ==> stepOwnersSurvive(s, invite(s, teamId, actor, wallet, role, expiresAt, now)))
{
  if inv(s) && canInvite(s, teamId, actor, wallet, role, expiresAt, now) {
    var after := invite(s, teamId, actor, wallet, role, expiresAt, now);
    assert exists tt :: tt in teamWithId(s, teamId) && (((manages(tt, actor) && ((!role.Admin?) || owns(tt, actor))) && !((exists m :: m in tt.members && !((m.wallet != wallet))))) && !((exists i :: i in inviteOf(tt, wallet) && !(((!i.role.Admin?) || owns(tt, actor))))));
    var tt :| tt in teamWithId(s, teamId) && (((manages(tt, actor) && ((!role.Admin?) || owns(tt, actor))) && !((exists m :: m in tt.members && !((m.wallet != wallet))))) && !((exists i :: i in inviteOf(tt, wallet) && !(((!i.role.Admin?) || owns(tt, actor))))));
    teamWithIdAll(s, teamId);
    assert tt in s.teams;
    var n := Invite(wallet, role, actor, expiresAt);
    var ra :| ra in memberRole(tt, actor) && !ra.Member?;
    memberRoleAll(tt, actor);
    var ma :| ma in tt.members && (ma.wallet == actor) && (ma.role == ra);
    wellP(s);
    assert ma.wallet != "";
    assert actor != "";
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].members == s.teams[i].members)
      ensures (after.teams[i].projects == s.teams[i].projects)
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      if s.teams[i].id == teamId {
        var t := s.teams[i];
        var t2 := after.teams[i];
        sameTeamIsSame(s, t, tt);
        assert t2.id == t.id;
        assert t2.members == t.members;
        assert t2.projects == t.projects;
        inviteDropIs(t.invites, wallet);
        assert t2.invites == ProofLib.Filter((i: Invite) => (i.wallet != wallet), t.invites) + [n];
        forall ii | ii in t2.invites
          ensures ((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), t2.invites)| == 1))
        {
          ProofLib.FilterAppend((o: Invite) => (o.wallet == ii.wallet), ProofLib.Filter((i: Invite) => (i.wallet != wallet), t.invites), n);
          if ii == n {
            ProofLib.FilterNone((o: Invite) => (o.wallet == ii.wallet), ProofLib.Filter((i: Invite) => (i.wallet != wallet), t.invites));
          } else {
            ProofLib.FilterMember((i: Invite) => (i.wallet != wallet), t.invites, ii);
            assert ii.wallet != wallet;
            filterWhenImplies((o: Invite) => (o.wallet == ii.wallet), (i: Invite) => (i.wallet != wallet), t.invites);
            assert n.wallet != ii.wallet;
          }
        }
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenUntouched(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

// respond: the invite for actor drops out of the one team that had it; on accept the team
// gains one member.

lemma respond_ensures(s: Teams, teamId: string, actor: string, accept: bool, now: int)
  ensures (inv(s) ==> canRespond(s, teamId, actor, accept, now) ==> alwaysTeamsAreWellFormed(respond(s, teamId, actor, accept, now)))
  ensures (inv(s) ==> canRespond(s, teamId, actor, accept, now) ==> stepRespondConsumesTheInvite(s, "respond", respond(s, teamId, actor, accept, now)))
  ensures (inv(s) ==> canRespond(s, teamId, actor, accept, now) ==> stepOwnersSurvive(s, respond(s, teamId, actor, accept, now)))
{
  if inv(s) && canRespond(s, teamId, actor, accept, now) {
    var after := respond(s, teamId, actor, accept, now);
    assert exists tt :: tt in teamWithId(s, teamId) && (!((exists m :: m in tt.members && !((m.wallet != actor)))) && (exists i :: i in inviteOf(tt, actor) && (((i.expiresAt > now) && (exists r :: r in memberRole(tt, i.inviter) && ((!r.Member?) && ((!i.role.Admin?) || r.Owner?)))) && (!(accept) || ((|tt.members| < 50) && (membershipsOf(s, actor) < 50))))));
    var tt :| tt in teamWithId(s, teamId) && (!((exists m :: m in tt.members && !((m.wallet != actor)))) && (exists i :: i in inviteOf(tt, actor) && (((i.expiresAt > now) && (exists r :: r in memberRole(tt, i.inviter) && ((!r.Member?) && ((!i.role.Admin?) || r.Owner?)))) && (!(accept) || ((|tt.members| < 50) && (membershipsOf(s, actor) < 50))))));
    teamWithIdAll(s, teamId);
    assert tt in s.teams;
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].projects == s.teams[i].projects)
      ensures (forall m :: m in s.teams[i].members && m.role.Owner? ==> m in after.teams[i].members)
      ensures (forall ii :: ii in after.teams[i].invites ==> (exists o :: o in s.teams[i].invites && ((o.wallet == ii.wallet) && (o.role == ii.role) && (o.inviter == ii.inviter))))
      ensures (|after.teams[i].members| <= (|s.teams[i].members| + 1))
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      if s.teams[i].id == teamId {
        var t := s.teams[i];
        var t2 := after.teams[i];
        sameTeamIsSame(s, t, tt);
        assert t2.id == t.id;
        assert t2.projects == t.projects;
        assert |inviteOf(t, actor)| != 0;
        inviteDropIs(t.invites, actor);
        assert t2.invites == ProofLib.Filter((i: Invite) => (i.wallet != actor), t.invites);
        assert t2.members == (if accept then (t.members + [Membership(actor, inviteOf(t, actor)[0].role)]) else t.members);
        forall ii | ii in t2.invites
          ensures ((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), t2.invites)| == 1))
        {
          ProofLib.FilterMember((i: Invite) => (i.wallet != actor), t.invites, ii);
          assert ii.wallet != actor;
          filterWhenImplies((o: Invite) => (o.wallet == ii.wallet), (i: Invite) => (i.wallet != actor), t.invites);
        }
        forall ii | ii in t2.invites
          ensures exists o :: o in t.invites && ((o.wallet == ii.wallet) && (o.role == ii.role) && (o.inviter == ii.inviter))
        {
          ProofLib.FilterMember((i: Invite) => (i.wallet != actor), t.invites, ii);
          assert ii in t.invites;
        }
        forall mo | mo in t.members && mo.role.Owner?
          ensures mo in t2.members
        {
        }
        assert |t2.members| <= |t.members| + 1;
        if accept {
          var nm := Membership(actor, inviteOf(t, actor)[0].role);
          assert t2.members == t.members + [nm];
          forall m | m in t2.members
            ensures (m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t2.members)| == 1)
          {
            ProofLib.FilterAppend((o: Membership) => (o.wallet == m.wallet), t.members, nm);
            if m == nm {
              ProofLib.FilterNone((o: Membership) => (o.wallet == m.wallet), t.members);
            } else {
              assert m in t.members;
              assert nm.wallet != m.wallet;
            }
          }
          assert |t2.members| == |t.members| + 1;
          assert |t.members| < 50;
        } else {
          assert t2.members == t.members;
        }
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenUntouched(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    respondStepPointwise(s, after);
    assert stepRespondConsumesTheInvite(s, "respond", after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

// cancelInvite: the invites for one wallet drop out of one team.

lemma cancelInvite_ensures(s: Teams, teamId: string, actor: string, wallet: string)
  ensures (inv(s) ==> canCancelInvite(s, teamId, actor, wallet) ==> alwaysTeamsAreWellFormed(cancelInvite(s, teamId, actor, wallet)))
  ensures (inv(s) ==> canCancelInvite(s, teamId, actor, wallet) ==> stepRespondConsumesTheInvite(s, "cancelInvite", cancelInvite(s, teamId, actor, wallet)))
  ensures (inv(s) ==> canCancelInvite(s, teamId, actor, wallet) ==> stepOwnersSurvive(s, cancelInvite(s, teamId, actor, wallet)))
{
  if inv(s) && canCancelInvite(s, teamId, actor, wallet) {
    var after := cancelInvite(s, teamId, actor, wallet);
    assert exists tt :: tt in teamWithId(s, teamId) && (manages(tt, actor) && (exists i :: i in inviteOf(tt, wallet) && ((!i.role.Admin?) || owns(tt, actor))));
    var tt :| tt in teamWithId(s, teamId) && (manages(tt, actor) && (exists i :: i in inviteOf(tt, wallet) && ((!i.role.Admin?) || owns(tt, actor))));
    teamWithIdAll(s, teamId);
    assert tt in s.teams;
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].members == s.teams[i].members)
      ensures (after.teams[i].projects == s.teams[i].projects)
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      if s.teams[i].id == teamId {
        var t := s.teams[i];
        var t2 := after.teams[i];
        sameTeamIsSame(s, t, tt);
        assert t2.id == t.id;
        assert t2.members == t.members;
        assert t2.projects == t.projects;
        inviteDropIs(t.invites, wallet);
        assert t2.invites == ProofLib.Filter((i: Invite) => (i.wallet != wallet), t.invites);
        forall ii | ii in t2.invites
          ensures ((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), t2.invites)| == 1))
        {
          ProofLib.FilterMember((i: Invite) => (i.wallet != wallet), t.invites, ii);
          assert ii.wallet != wallet;
          filterWhenImplies((o: Invite) => (o.wallet == ii.wallet), (i: Invite) => (i.wallet != wallet), t.invites);
        }
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenUntouched(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

// changeRole: a non-owner member's role changes in place; the owner stays.

lemma changeRole_ensures(s: Teams, teamId: string, actor: string, wallet: string, role: Role)
  ensures (inv(s) ==> canChangeRole(s, teamId, actor, wallet, role) ==> alwaysTeamsAreWellFormed(changeRole(s, teamId, actor, wallet, role)))
  ensures (inv(s) ==> canChangeRole(s, teamId, actor, wallet, role) ==> stepRespondConsumesTheInvite(s, "changeRole", changeRole(s, teamId, actor, wallet, role)))
  ensures (inv(s) ==> canChangeRole(s, teamId, actor, wallet, role) ==> stepOwnersSurvive(s, changeRole(s, teamId, actor, wallet, role)))
{
  if inv(s) && canChangeRole(s, teamId, actor, wallet, role) {
    var after := changeRole(s, teamId, actor, wallet, role);
    assert exists tt :: tt in teamWithId(s, teamId) && (owns(tt, actor) && (exists r :: r in memberRole(tt, wallet) && (!r.Owner?)));
    var tt :| tt in teamWithId(s, teamId) && (owns(tt, actor) && (exists r :: r in memberRole(tt, wallet) && (!r.Owner?)));
    teamWithIdAll(s, teamId);
    assert tt in s.teams;
    var rw :| rw in memberRole(tt, wallet) && !rw.Owner?;
    memberRoleAll(tt, wallet);
    assert exists mw :: mw in tt.members && (mw.wallet == wallet) && (mw.role == rw);
    var mw :| mw in tt.members && (mw.wallet == wallet) && (mw.role == rw);
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].projects == s.teams[i].projects)
      ensures (forall m :: m in s.teams[i].members && m.role.Owner? ==> m in after.teams[i].members)
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      if s.teams[i].id == teamId {
        var t := s.teams[i];
        var t2 := after.teams[i];
        sameTeamIsSame(s, t, tt);
        assert t2.id == t.id;
        assert t2.projects == t.projects;
        assert |t2.members| == |t.members|;
        forall k | 0 <= k < |t2.members|
          ensures t2.members[k].wallet == t.members[k].wallet
        {
        }
        forall m | m in t2.members
          ensures (m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t2.members)| == 1)
        {
          var k :| 0 <= k < |t2.members| && t2.members[k] == m;
          ProofLib.FilterLengthPointwise((o: Membership) => (o.wallet == t.members[k].wallet), (o: Membership) => (o.wallet == t.members[k].wallet), t.members, t2.members);
          ProofLib.FilterSamePredicate((o: Membership) => (o.wallet == t.members[k].wallet), (o: Membership) => (o.wallet == m.wallet), t2.members);
        }
        forall mo | mo in t.members && mo.role.Owner?
          ensures mo in t2.members && mo.role.Owner?
        {
          var k :| 0 <= k < |t.members| && t.members[k] == mo;
          if mo.wallet == wallet {
            sameWalletIsSameMember(t, mo, mw);
          }
          assert mo.wallet != wallet;
          assert t2.members[k] == mo;
        }
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenUntouched(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

// removeMember: the wallet's membership drops out; the removed member was never the owner.

lemma removeMember_ensures(s: Teams, teamId: string, actor: string, wallet: string)
  ensures (inv(s) ==> canRemoveMember(s, teamId, actor, wallet) ==> alwaysTeamsAreWellFormed(removeMember(s, teamId, actor, wallet)))
  ensures (inv(s) ==> canRemoveMember(s, teamId, actor, wallet) ==> stepRespondConsumesTheInvite(s, "removeMember", removeMember(s, teamId, actor, wallet)))
  ensures (inv(s) ==> canRemoveMember(s, teamId, actor, wallet) ==> stepOwnersSurvive(s, removeMember(s, teamId, actor, wallet)))
{
  if inv(s) && canRemoveMember(s, teamId, actor, wallet) {
    var after := removeMember(s, teamId, actor, wallet);
    assert exists tt :: tt in teamWithId(s, teamId) && (exists target :: target in memberRole(tt, wallet) && ((!target.Owner?) && (((actor == wallet) || owns(tt, actor)) || (target.Member? && (typed0_app__teams(Role.Admin) in memberRole(tt, actor))))));
    var tt :| tt in teamWithId(s, teamId) && (exists target :: target in memberRole(tt, wallet) && ((!target.Owner?) && (((actor == wallet) || owns(tt, actor)) || (target.Member? && (typed0_app__teams(Role.Admin) in memberRole(tt, actor))))));
    teamWithIdAll(s, teamId);
    assert tt in s.teams;
    var rw :| rw in memberRole(tt, wallet) && !rw.Owner? && (((actor == wallet) || owns(tt, actor)) || (rw.Member? && (typed0_app__teams(Role.Admin) in memberRole(tt, actor))));
    memberRoleAll(tt, wallet);
    assert exists mw :: mw in tt.members && (mw.wallet == wallet) && (mw.role == rw);
    var mw :| mw in tt.members && (mw.wallet == wallet) && (mw.role == rw);
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].projects == s.teams[i].projects)
      ensures (forall m :: m in s.teams[i].members && m.role.Owner? ==> m in after.teams[i].members)
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      if s.teams[i].id == teamId {
        var t := s.teams[i];
        var t2 := after.teams[i];
        sameTeamIsSame(s, t, tt);
        assert t2.id == t.id;
        assert t2.projects == t.projects;
        memberDropIs(t.members, wallet);
        assert t2.members == ProofLib.Filter((m: Membership) => (m.wallet != wallet), t.members);
        forall m | m in t2.members
          ensures (m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t2.members)| == 1)
        {
          ProofLib.FilterMember((m: Membership) => (m.wallet != wallet), t.members, m);
          assert m.wallet != wallet;
          filterWhenImplies((o: Membership) => (o.wallet == m.wallet), (m: Membership) => (m.wallet != wallet), t.members);
        }
        ProofLib.FilterImpLength((m: Membership) => (m.wallet != wallet), (m: Membership) => true, t.members);
        assert |t2.members| <= |t.members|;
        forall mo | mo in t.members && mo.role.Owner?
          ensures mo in t2.members
        {
          if mo.wallet == wallet {
            sameWalletIsSameMember(t, mo, mw);
          }
          assert mo.wallet != wallet;
          ProofLib.FilterMember((m: Membership) => (m.wallet != wallet), t.members, mo);
        }
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenUntouched(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

lemma sameWalletIsSameMember(t: Team, a: Membership, b: Membership)
  requires !(exists m :: m in t.members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), t.members)| == 1)))
  requires a in t.members && b in t.members && (a.wallet == b.wallet)
  ensures a == b
{
  ProofLib.FilterMember((o: Membership) => (o.wallet == a.wallet), t.members, a);
  ProofLib.FilterMember((o: Membership) => (o.wallet == a.wallet), t.members, b);
  assert a == ProofLib.Filter((o: Membership) => (o.wallet == a.wallet), t.members)[0];
  assert b == ProofLib.Filter((o: Membership) => (o.wallet == a.wallet), t.members)[0];
}

// createProject: one team's projects gain an entry whose id no team carries.

lemma createProject_ensures(s: Teams, teamId: string, projectId: string, actor: string, name: string, budget: int)
  ensures (inv(s) ==> canCreateProject(s, teamId, projectId, actor, name, budget) ==> alwaysTeamsAreWellFormed(createProject(s, teamId, projectId, actor, name, budget)))
  ensures (inv(s) ==> canCreateProject(s, teamId, projectId, actor, name, budget) ==> stepRespondConsumesTheInvite(s, "createProject", createProject(s, teamId, projectId, actor, name, budget)))
  ensures (inv(s) ==> canCreateProject(s, teamId, projectId, actor, name, budget) ==> stepOwnersSurvive(s, createProject(s, teamId, projectId, actor, name, budget)))
{
  if inv(s) && canCreateProject(s, teamId, projectId, actor, name, budget) {
    var after := createProject(s, teamId, projectId, actor, name, budget);
    assert exists tt :: tt in teamWithId(s, teamId) && manages(tt, actor);
    var tt :| tt in teamWithId(s, teamId) && manages(tt, actor);
    teamWithIdAll(s, teamId);
    assert tt in s.teams;
    var n := Project(projectId, name, budget, 0, false);
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].members == s.teams[i].members)
      ensures ((s.teams[i].id == teamId) ==> (after.teams[i].projects == s.teams[i].projects + [n])) && ((s.teams[i].id != teamId) ==> (after.teams[i] == s.teams[i]))
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      if s.teams[i].id == teamId {
        var t := s.teams[i];
        var t2 := after.teams[i];
        sameTeamIsSame(s, t, tt);
        assert t2.id == t.id;
        assert t2.members == t.members;
        assert t2.projects == t.projects + [n];
        forall p | p in t2.projects
          ensures ((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t2.projects)| == 1))
        {
          assert p in t.projects || p == n;
          ProofLib.FilterAppend((o: Project) => (o.id == p.id), t.projects, n);
          if p == n {
            assert p.id == projectId;
            forall q | q in t.projects
              ensures q.id != p.id
            {
            }
            ProofLib.FilterNone((o: Project) => (o.id == p.id), t.projects);
          } else {
            assert p in t.projects;
            assert n.id != p.id;
          }
        }
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    forall i | 0 <= i < |after.teams|
      ensures !(exists pp :: pp in after.teams[i].projects && !((|teamOfProject(after, pp.id)| == 1)))
    {
      forall pp | pp in after.teams[i].projects
        ensures |teamOfProject(after, pp.id)| == 1
      {
        teamOfProjectIs(s, pp.id);
        teamOfProjectIs(after, pp.id);
        if s.teams[i].id == teamId && pp == n {
          assert (exists p :: p in after.teams[i].projects && (p.id == pp.id));
          forall j | 0 <= j < |after.teams| && j != i
            ensures !((exists p :: p in after.teams[j].projects && (p.id == pp.id)))
          {
            assert s.teams[i] in s.teams;
            assert s.teams[j].id != teamId by {
              if s.teams[j].id == teamId {
                ProofLib.FilterTwo((o: Team) => (o.id == teamId), s.teams, i, j);
                ProofLib.FilterSamePredicate((o: Team) => (o.id == teamId), (o: Team) => (o.id == s.teams[i].id), s.teams);
                assert |ProofLib.Filter((o: Team) => (o.id == s.teams[i].id), s.teams)| == 1;
              }
            }
            assert after.teams[j] == s.teams[j];
          }
          ProofLib.FilterOne((t: Team) => (exists p :: p in t.projects && (p.id == pp.id)), after.teams, i);
        } else {
          assert pp in s.teams[i].projects;
          assert s.teams[i] in s.teams;
          assert !(exists p :: p in s.teams[i].projects && !(p.id != projectId));
          assert pp.id != projectId;
          assert !(exists p :: p in s.teams[i].projects && !(|teamOfProject(s, p.id)| == 1));
          assert |teamOfProject(s, pp.id)| == 1;
          countSameForOldProject(s, after, i, pp, teamId, n);
          assert |teamOfProject(after, pp.id)| == 1;
        }
      }
    }
    piece1FromElems(after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

// updateProject and archiveProject: every project keeps its id, so the per-project owner
// count and each team's project-id counts carry across.

lemma updateProject_ensures(s: Teams, projectId: string, actor: string, name: string, budget: int)
  ensures (inv(s) ==> canUpdateProject(s, projectId, actor, name, budget) ==> alwaysTeamsAreWellFormed(updateProject(s, projectId, actor, name, budget)))
  ensures (inv(s) ==> canUpdateProject(s, projectId, actor, name, budget) ==> stepRespondConsumesTheInvite(s, "updateProject", updateProject(s, projectId, actor, name, budget)))
  ensures (inv(s) ==> canUpdateProject(s, projectId, actor, name, budget) ==> stepOwnersSurvive(s, updateProject(s, projectId, actor, name, budget)))
{
  if inv(s) && canUpdateProject(s, projectId, actor, name, budget) {
    var after := updateProject(s, projectId, actor, name, budget);
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].members == s.teams[i].members)
      ensures (|after.teams[i].projects| == |s.teams[i].projects|)
      ensures (forall k :: 0 <= k < |s.teams[i].projects| ==> (after.teams[i].projects[k].id == s.teams[i].projects[k].id))
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      var t := s.teams[i];
      var t2 := after.teams[i];
      assert t2.id == t.id;
      assert t2.members == t.members;
      assert |t2.projects| == |t.projects|;
      forall k | 0 <= k < |t2.projects|
        ensures t2.projects[k].id == t.projects[k].id
      {
      }
      forall p | p in t2.projects
        ensures ((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t2.projects)| == 1))
      {
        var k :| 0 <= k < |t2.projects| && t2.projects[k] == p;
        assert t.projects[k] in t.projects;
        assert p.id == t.projects[k].id;
        assert p.spent == t.projects[k].spent;
        if t.projects[k].id == projectId {
          assert p.name == name;
          assert p.budget == budget;
        } else {
          assert p == t.projects[k];
        }
        ProofLib.FilterLengthPointwise((o: Project) => (o.id == t.projects[k].id), (o: Project) => (o.id == t.projects[k].id), t.projects, t2.projects);
        ProofLib.FilterSamePredicate((o: Project) => (o.id == t.projects[k].id), (o: Project) => (o.id == p.id), t2.projects);
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenIdsKeep(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

lemma archiveProject_ensures(s: Teams, projectId: string, actor: string)
  ensures (inv(s) ==> canArchiveProject(s, projectId, actor) ==> alwaysTeamsAreWellFormed(archiveProject(s, projectId, actor)))
  ensures (inv(s) ==> canArchiveProject(s, projectId, actor) ==> stepRespondConsumesTheInvite(s, "archiveProject", archiveProject(s, projectId, actor)))
  ensures (inv(s) ==> canArchiveProject(s, projectId, actor) ==> stepOwnersSurvive(s, archiveProject(s, projectId, actor)))
{
  if inv(s) && canArchiveProject(s, projectId, actor) {
    var after := archiveProject(s, projectId, actor);
    wellP(s);
    forall i | 0 <= i < |after.teams|
      ensures (after.teams[i].id == s.teams[i].id)
      ensures (after.teams[i].members == s.teams[i].members)
      ensures (|after.teams[i].projects| == |s.teams[i].projects|)
      ensures (forall k :: 0 <= k < |s.teams[i].projects| ==> (after.teams[i].projects[k].id == s.teams[i].projects[k].id))
      ensures (after.teams[i].id != "")
      ensures (after.teams[i].name != "")
      ensures (|after.teams[i].members| >= 1)
      ensures (|after.teams[i].members| <= 50)
      ensures !((exists m :: m in after.teams[i].members && !((m.wallet != "") && (|ProofLib.Filter((o: Membership) => (o.wallet == m.wallet), after.teams[i].members)| == 1))))
      ensures (exists m :: m in after.teams[i].members && m.role.Owner?)
      ensures !((exists ii :: ii in after.teams[i].invites && !((ii.wallet != "") && (!ii.role.Owner?) && (ii.inviter != "") && (ii.expiresAt >= 0) && (|ProofLib.Filter((o: Invite) => (o.wallet == ii.wallet), after.teams[i].invites)| == 1))))
      ensures !((exists pp :: pp in after.teams[i].projects && !((pp.id != "") && (pp.name != "") && budgetOk(pp.budget) && (pp.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == pp.id), after.teams[i].projects)| == 1))))
    {
      var t := s.teams[i];
      var t2 := after.teams[i];
      assert t2.id == t.id;
      assert t2.members == t.members;
      assert |t2.projects| == |t.projects|;
      forall k | 0 <= k < |t2.projects|
        ensures t2.projects[k].id == t.projects[k].id
      {
      }
      forall p | p in t2.projects
        ensures ((p.id != "") && (p.name != "") && budgetOk(p.budget) && (p.spent >= 0) && (|ProofLib.Filter((o: Project) => (o.id == p.id), t2.projects)| == 1))
      {
        var k :| 0 <= k < |t2.projects| && t2.projects[k] == p;
        assert t.projects[k] in t.projects;
        if t.projects[k].id == projectId {
          assert p == t.projects[k].(archived := true);
          assert p.id == t.projects[k].id;
          assert p.name == t.projects[k].name;
          assert p.budget == t.projects[k].budget;
          assert p.spent == t.projects[k].spent;
        } else {
          assert p == t.projects[k];
        }
        ProofLib.FilterLengthPointwise((o: Project) => (o.id == t.projects[k].id), (o: Project) => (o.id == t.projects[k].id), t.projects, t2.projects);
        ProofLib.FilterSamePredicate((o: Project) => (o.id == t.projects[k].id), (o: Project) => (o.id == p.id), t2.projects);
      }
    }
    piece1FromElems(after);
    teamIdsUniqueAfter(s, after);
    projectsRuleWhenIdsKeep(s, after);
    wellP(after);
    assert alwaysTeamsAreWellFormed(after);
    ownersSurvivePointwise(s, after);
    assert stepOwnersSurvive(s, after);
  }
}

// spec/app/teams.md, "An invite can be used only once", "A member cannot invite" and "The
// sole owner cannot be removed or demoted": each chain ends at the single appended team.

lemma lawAnsweringTwiceIsImpossible_ensures(s: Teams, id: string, name: string, actor: string, wallet: string, role: Role, expiresAt: int, accept: bool, now: int)
  ensures (lawAnsweringTwiceIsImpossible(s, id, name, actor, wallet, role, expiresAt, accept, now) == true)
{
  var x := Team(id, name, [Membership(actor, Role.Owner)], [], []);
  var n := Invite(wallet, role, actor, expiresAt);
  var t1 := createTeam(s, id, name, actor, now);
  var t2 := invite(t1, id, actor, wallet, role, expiresAt, now);
  var t3 := respond(t2, id, wallet, accept, now);
  if !(exists t :: t in s.teams && (t.id == id)) {
    assert t1.teams == s.teams + [x];
    assert |t3.teams| == |s.teams| + 1;
    forall a | a in teamWithId(t3, id)
      ensures |inviteOf(a, wallet)| == 0
    {
      teamWithIdAll(t3, id);
      var j :| 0 <= j < |t3.teams| && t3.teams[j] == a;
      if j < |s.teams| {
        assert t2.teams[j].id == t1.teams[j].id;
        assert s.teams[j].id == id;
        assert s.teams[j] in s.teams;
        assert false;
      }
      assert j == |s.teams|;
      inviteDropIs(x.invites, wallet);
      assert t2.teams[j].invites == ProofLib.Filter((i: Invite) => (i.wallet != wallet), x.invites) + [n];
      ProofLib.FilterNil((i: Invite) => (i.wallet != wallet), x.invites);
      assert t2.teams[j].invites == [n];
      inviteOfIs(t2.teams[j], wallet);
      assert |inviteOf(t2.teams[j], wallet)| != 0 by {
        ProofLib.FilterCons((i: Invite) => (i.wallet == wallet), [n]);
      }
      inviteDropIs(t2.teams[j].invites, wallet);
      assert a.invites == ProofLib.Filter((i: Invite) => (i.wallet != wallet), t2.teams[j].invites);
      ProofLib.FilterCons((i: Invite) => (i.wallet != wallet), [n]);
      assert a.invites == [];
      inviteOfIs(a, wallet);
      ProofLib.FilterNil((i: Invite) => (i.wallet == wallet), a.invites);
    }
    assert !(exists a :: a in teamWithId(t3, id) && (exists i :: i in inviteOf(a, wallet) && (((i.expiresAt > now) && (exists r :: r in memberRole(a, i.inviter) && ((!r.Member?) && ((!i.role.Admin?) || r.Owner?)))) && (!(accept) || ((|a.members| < 50) && (membershipsOf(t3, wallet) < 50))))));
    assert !(exists t :: t in teamWithId(t3, id) && (!((exists m :: m in t.members && !((m.wallet != wallet)))) && (exists i :: i in inviteOf(t, wallet) && (((i.expiresAt > now) && (exists r :: r in memberRole(t, i.inviter) && ((!r.Member?) && ((!i.role.Admin?) || r.Owner?)))) && (!(accept) || ((|t.members| < 50) && (membershipsOf(t3, wallet) < 50)))))));
    assert !canRespond(t3, id, wallet, accept, now);
  }
}

lemma lawMemberCannotInvite_ensures(s: Teams, id: string, name: string, actor: string, wallet: string, role: Role, expiresAt: int, now: int)
  ensures (lawMemberCannotInvite(s, id, name, actor, wallet, role, expiresAt, now) == true)
{
  var x := Team(id, name, [Membership(actor, Role.Owner)], [], []);
  var n := Invite(wallet, Role.Member, actor, expiresAt);
  var t1 := createTeam(s, id, name, actor, now);
  var t2 := invite(t1, id, actor, wallet, Role.Member, expiresAt, now);
  var t3 := respond(t2, id, wallet, true, now);
  if !(exists t :: t in s.teams && (t.id == id)) && actor != wallet {
    assert t1.teams == s.teams + [x];
    assert |t3.teams| == |s.teams| + 1;
    forall a | a in teamWithId(t3, id)
      ensures !manages(a, wallet)
    {
      teamWithIdAll(t3, id);
      var j :| 0 <= j < |t3.teams| && t3.teams[j] == a;
      if j < |s.teams| {
        assert t2.teams[j].id == t1.teams[j].id;
        assert s.teams[j].id == id;
        assert s.teams[j] in s.teams;
        assert false;
      }
      assert j == |s.teams|;
      inviteDropIs(x.invites, wallet);
      ProofLib.FilterNil((i: Invite) => (i.wallet != wallet), x.invites);
      assert t2.teams[j].invites == [n];
      inviteOfIs(t2.teams[j], wallet);
      assert |inviteOf(t2.teams[j], wallet)| != 0 by {
        ProofLib.FilterCons((i: Invite) => (i.wallet == wallet), [n]);
      }
      assert a.members == x.members + [Membership(wallet, inviteOf(t2.teams[j], wallet)[0].role)];
      assert inviteOf(t2.teams[j], wallet) == [n] by {
        ProofLib.FilterCons((i: Invite) => (i.wallet == wallet), [n]);
      }
      assert a.members == [Membership(actor, Role.Owner), Membership(wallet, Role.Member)];
      memberRoleAll(a, wallet);
      forall r | r in memberRole(a, wallet)
        ensures r.Member?
      {
        memberRoleAll(a, wallet);
      }
      assert !(exists r :: r in memberRole(a, wallet) && (!r.Member?));
      assert !manages(a, wallet);
    }
    assert !(exists t :: t in teamWithId(t3, id) && ((((manages(t, wallet) && ((!role.Admin?) || owns(t, wallet))) && !((exists m :: m in t.members && !((m.wallet != actor))))) && !((exists i :: i in inviteOf(t, actor) && !(((!i.role.Admin?) || owns(t, wallet)))))) && (|Std.Collections.Seq.Filter((i: Invite) => (i.expiresAt > now), t.invites)| < 50)));
    assert !canInvite(t3, id, wallet, actor, role, expiresAt, now);
  }
}

lemma lawSoleOwnerStays_ensures(s: Teams, id: string, name: string, actor: string, role: Role, now: int)
  ensures (lawSoleOwnerStays(s, id, name, actor, role, now) == true)
{
  var x := Team(id, name, [Membership(actor, Role.Owner)], [], []);
  var t1 := createTeam(s, id, name, actor, now);
  if !(exists t :: t in s.teams && (t.id == id)) {
    assert t1.teams == s.teams + [x];
    forall a | a in teamWithId(t1, id)
      ensures !(exists target :: target in memberRole(a, actor) && !target.Owner?)
    {
      teamWithIdAll(t1, id);
      var j :| 0 <= j < |t1.teams| && t1.teams[j] == a;
      if j < |s.teams| {
        assert s.teams[j].id == id;
        assert s.teams[j] in s.teams;
        assert false;
      }
      assert a.members == [Membership(actor, Role.Owner)];
      memberRoleAll(a, actor);
      forall target | target in memberRole(a, actor)
        ensures target.Owner?
      {
        memberRoleAll(a, actor);
      }
    }
    assert !(exists t :: t in teamWithId(t1, id) && (exists target :: target in memberRole(t, actor) && ((!target.Owner?) && (((actor == actor) || owns(t, actor)) || (target.Member? && (typed0_app__teams(Role.Admin) in memberRole(t, actor)))))));
    assert !canRemoveMember(t1, id, actor, actor);
    assert !(exists t :: t in teamWithId(t1, id) && (owns(t, actor) && (exists r :: r in memberRole(t, actor) && (!r.Owner?))));
    assert !canChangeRole(t1, id, actor, actor, role);
  }
}
