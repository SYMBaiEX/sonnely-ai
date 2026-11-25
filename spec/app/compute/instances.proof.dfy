// spec/app/compute/instances.md, "Story: Rent a confidential machine"

// spec/app/compute/instances.md, "Story: Rent a confidential machine": division grows with its dividend.
lemma DivMono(x: int, y: int, b: int)
  requires b > 0 && 0 <= x && x <= y
  ensures x / b <= y / b
{
  if x / b > y / b {
    assert x / b >= y / b + 1;
    assert (x / b) * b >= (y / b + 1) * b;
    assert (y / b + 1) * b == (y / b) * b + b;
    assert y < (y / b + 1) * b;
    assert (x / b) * b <= x;
    assert false;
  }
}

// spec/app/compute/instances.md, "The fee is 25% of compute cost plus 10,000 micro-USD for a billed run"
lemma CeilDivNonNeg(a: int, b: int)
  ensures ceilDiv(a, b) >= 0
{
  if a > 0 && b > 0 {
    assert (a + b - 1) / b >= 0;
    assert JSFloorDiv(a + b - 1, b) == (a + b - 1) / b;
  }
}

// spec/app/compute/instances.md, "The fee is 25% of compute cost plus 10,000 micro-USD for a billed run"
lemma CeilDivMono(a1: int, a2: int, b: int)
  requires b > 0 && a1 <= a2
  ensures ceilDiv(a1, b) <= ceilDiv(a2, b)
{
  CeilDivNonNeg(a1, b);
  CeilDivNonNeg(a2, b);
  if a1 > 0 {
    assert a2 > 0;
    assert quotient_app__compute__instances((a1 + b) - 1, b) == JSFloorDiv(a1 + b - 1, b);
    assert quotient_app__compute__instances((a2 + b) - 1, b) == JSFloorDiv(a2 + b - 1, b);
    assert JSFloorDiv(a1 + b - 1, b) == (a1 + b - 1) / b;
    assert JSFloorDiv(a2 + b - 1, b) == (a2 + b - 1) / b;
    DivMono(a1 + b - 1, a2 + b - 1, b);
  }
}

// spec/app/compute/instances.md, "The fee is 25% of compute cost plus 10,000 micro-USD for a billed run"
lemma QuoteNonNeg(rate: int, unit: int, s: int)
  ensures quoteFor(rate, unit, s).base >= 0 && quoteFor(rate, unit, s).fee >= 0 && quoteFor(rate, unit, s).total >= 0
{
  CeilDivNonNeg(s, unit);
  CeilDivNonNeg(rate * ceilDiv(s, unit) * unit, 3600);
  CeilDivNonNeg(quoteFor(rate, unit, s).base * 25, 100);
}

// spec/app/compute/instances.md, "Metered time beyond the window is never charged"
lemma QuoteBaseMono(rate: int, unit: int, s1: int, s2: int)
  requires unit > 0 && 0 <= s1 && s1 <= s2
  ensures quoteFor(rate, unit, s1).base <= quoteFor(rate, unit, s2).base
{
  CeilDivNonNeg(s1, unit);
  CeilDivNonNeg(s2, unit);
  CeilDivMono(s1, s2, unit);
  var u1 := ceilDiv(s1, unit);
  var u2 := ceilDiv(s2, unit);
  assert u1 >= 0 && u2 >= u1 && unit > 0;
  if rate >= 0 {
    assert u1 * unit <= u2 * unit;
    assert rate * (u1 * unit) <= rate * (u2 * unit);
    assert rate * u1 * unit <= rate * u2 * unit;
    CeilDivMono(rate * u1 * unit, rate * u2 * unit, 3600);
  } else {
    assert rate * u1 * unit <= 0 && rate * u2 * unit <= 0;
    assert ceilDiv(rate * u1 * unit, 3600) == 0;
    assert ceilDiv(rate * u2 * unit, 3600) == 0;
  }
  assert quoteFor(rate, unit, s1).base == ceilDiv(rate * u1 * unit, 3600);
  assert quoteFor(rate, unit, s2).base == ceilDiv(rate * u2 * unit, 3600);
}

// spec/app/compute/instances.md, "A run's reserve is the quote of its spec": what a settled run is billed never passes its quote.
lemma ChargeLeQuote(x: Run, seconds: int, metered: int)
  requires seconds >= 0 && metered >= 0
  ensures settledCharge(x, seconds, metered).charged <= quote(x.spec, x.minutes)
{
  var rate := hourlyBaseOf(x.spec);
  var unit := unitOf(x.spec);
  var cap := if seconds > x.minutes * 60 then x.minutes * 60 else seconds;
  var part := quoteFor(rate, unit, cap);
  var l6 := if x.spec.Blackbox? then part.base else if metered < part.base then metered else part.base;
  var l7 := if x.kind.Blackboxes? && !x.attestation.Verified? then 0 else l6;
  var fee7 := if l7 == 0 then 0 else 10000 + ceilDiv(l7 * 25, 100);
  var full := quoteFor(rate, unit, x.minutes * 60);
  assert settledCharge(x, seconds, metered).charged == l7 + fee7;
  QuoteNonNeg(rate, unit, x.minutes * 60);
  if cap <= 0 {
    assert ceilDiv(cap, unit) == 0;
    assert part.base == 0;
    assert l6 == 0;
    assert l7 == 0;
  } else {
    QuoteBaseMono(rate, unit, cap, x.minutes * 60);
    CeilDivNonNeg(rate * ceilDiv(cap, unit) * unit, 3600);
    assert part.base <= full.base;
    assert l7 <= full.base;
    if l7 > 0 {
      assert full.base > 0;
      assert ceilDiv(x.minutes * 60, unit) > 0 by {
        if ceilDiv(x.minutes * 60, unit) == 0 {
          assert rate * 0 * unit == 0;
          assert full.base == ceilDiv(0, 3600);
          assert full.base == 0;
        }
      }
      CeilDivMono(l7 * 25, full.base * 25, 100);
      assert fee7 <= full.fee;
      assert l7 + fee7 <= full.total;
    }
  }
}

// spec/app/compute/instances.md, "A charge never exceeds the hold, and the hold is charge plus what returned": a billed run's charge fields are in range.
lemma ChargeFields(x: Run, seconds: int, metered: int)
  requires seconds >= 0 && metered >= 0 && x.reserve == quote(x.spec, x.minutes)
  ensures settledCharge(x, seconds, metered).phase.Settled?
  ensures settledCharge(x, seconds, metered).charged >= 0
  ensures settledCharge(x, seconds, metered).charged <= settledCharge(x, seconds, metered).reserve
  ensures settledCharge(x, seconds, metered).charged + settledCharge(x, seconds, metered).returned == settledCharge(x, seconds, metered).reserve
  ensures settledCharge(x, seconds, metered).returned >= 0
{
  var y := settledCharge(x, seconds, metered);
  ChargeLeQuote(x, seconds, metered);
  assert y.charged <= x.reserve;
  var rate := hourlyBaseOf(x.spec);
  var unit := unitOf(x.spec);
  var cap := if seconds > x.minutes * 60 then x.minutes * 60 else seconds;
  var part := quoteFor(rate, unit, cap);
  CeilDivNonNeg(rate * ceilDiv(cap, unit) * unit, 3600);
  var l6 := if x.spec.Blackbox? then part.base else if metered < part.base then metered else part.base;
  assert l6 >= 0;
  var l7 := if x.kind.Blackboxes? && !x.attestation.Verified? then 0 else l6;
  assert l7 >= 0;
  CeilDivNonNeg(l7 * 25, 100);
  assert y.charged >= 0;
}

// spec/app/compute/instances.md, "Run ids and a wallet's references are never reused": a rule that no run breaks holds at each run.
lemma RunFacts(c: Compute, r: Run)
  requires inv(c) && r in c.runs
  ensures (r.phase.Teardown? || r.phase.Settled?) == (!r.result.Ongoing?)
  ensures r.kind == kindOf(r.spec)
  ensures !r.kind.Blackboxes? || !r.phase.Running? || r.attestation.Verified?
  ensures !r.kind.DryDocks? || r.attestation.Absent?
  ensures r.reserve == quote(r.spec, r.minutes)
  ensures r.charged >= 0 && r.charged <= r.reserve && (r.phase.Settled? || r.charged == 0) &&
          (!r.phase.Settled? || (r.charged + r.returned == r.reserve && r.returned >= 0))
  ensures !r.kind.Blackboxes? || r.attestation.Verified? || r.charged == 0
{
  if !((r.phase.Teardown? || r.phase.Settled?) == (!r.result.Ongoing?)) {
    assert exists x :: x in c.runs && !(((x.phase.Teardown? || x.phase.Settled?) == (!x.result.Ongoing?)));
  }
  if !(r.kind == kindOf(r.spec)) {
    assert exists x :: x in c.runs && !((x.kind == kindOf(x.spec)));
  }
  if !(!r.kind.Blackboxes? || !r.phase.Running? || r.attestation.Verified?) {
    assert exists x :: x in c.runs && !((((!x.kind.Blackboxes?) || (!x.phase.Running?)) || x.attestation.Verified?));
  }
  if !(!r.kind.DryDocks? || r.attestation.Absent?) {
    assert exists x :: x in c.runs && !(((!x.kind.DryDocks?) || x.attestation.Absent?));
  }
  if !(r.reserve == quote(r.spec, r.minutes)) {
    assert exists x :: x in c.runs && !((x.reserve == quote(x.spec, x.minutes)));
  }
  if !(r.charged >= 0 && r.charged <= r.reserve && (r.phase.Settled? || r.charged == 0) &&
       (!r.phase.Settled? || (r.charged + r.returned == r.reserve && r.returned >= 0))) {
    assert exists x :: x in c.runs && !(((((x.charged >= 0) && (x.charged <= x.reserve)) && (x.phase.Settled? || (x.charged == 0))) && ((!x.phase.Settled?) || (((x.charged + x.returned) == x.reserve) && (x.returned >= 0)))));
  }
  if !(!r.kind.Blackboxes? || r.attestation.Verified? || r.charged == 0) {
    assert exists x :: x in c.runs && !((((!x.kind.Blackboxes?) || x.attestation.Verified?) || (x.charged == 0)));
  }
}

// spec/app/compute/instances.md, "Run ids and a wallet's references are never reused": two runs carrying one id are one run.
lemma SameIdSameRun(c: Compute, x: Run, w: Run)
  requires alwaysIdsAreUnique(c) && x in c.runs && w in c.runs && w.id == x.id
  ensures x == w
{
  if x != w {
    assert !((x.id != w.id) || (x == w));
    assert exists o :: o in c.runs && !(((x.id != o.id) || (x == o)));
    assert !(!(exists o :: o in c.runs && !(((x.id != o.id) || (x == o)))));
  }
}

// spec/app/compute/instances.md, "A wallet can run one compute job at a time": two active runs of one wallet are one run.
lemma SameWalletActiveRun(c: Compute, x: Run, w: Run)
  requires alwaysOneActivePerWallet(c) && x in c.runs && w in c.runs &&
           isActive(x) && isActive(w) && x.wallet == w.wallet
  ensures x == w
{
  if x != w {
    assert ((isActive(x) && isActive(w)) && (x.wallet == w.wallet));
    assert !((!(((isActive(x) && isActive(w)) && (x.wallet == w.wallet)))) || (x == w));
    assert exists o :: o in c.runs && !((!(((isActive(x) && isActive(o)) && (x.wallet == o.wallet))) || (x == o)));
    assert !(!(exists o :: o in c.runs && !((!(((isActive(x) && isActive(o)) && (x.wallet == o.wallet))) || (x == o)))));
  }
}

// spec/app/compute/instances.md, "Run ids and a wallet's references are never reused": every run keeps the id it was opened with.
lemma UniqueById(c: Compute, x: Run, w: Run)
  requires inv(c) && x in c.runs && w in c.runs && w.id == x.id
  ensures x == w
{
  assert alwaysIdsAreUnique(c);
  SameIdSameRun(c, x, w);
}

// spec/app/compute/instances.md, "A wallet opens a run for a supported window and a valid workload": a first open of a wallet and reference leaves room.
lemma CanOpenFacts(c: Compute, id: string, reference: string, wallet: string, spec: Workload, minutes: int)
  requires canOpen(c, id, reference, wallet, spec, minutes) && !(exists r :: r in c.runs && ((r.wallet == wallet) && (r.reference == reference)))
  ensures !(exists r :: r in c.runs && (r.id == id))
  ensures !(exists r :: r in c.runs && ((r.wallet == wallet) && isActive(r)))
  ensures activeOf(c, kindOf(spec)) < kindLimit(kindOf(spec))
{
  assert !(exists r :: r in c.runs && (r.id == id));
  assert ((exists r :: r in c.runs && ((r.wallet == wallet) && (r.reference == reference))) || (!((exists r :: r in c.runs && ((r.wallet == wallet) && isActive(r)))) && (activeOf(c, kindOf(spec)) < kindLimit(kindOf(spec)))));
}

// spec/app/compute/instances.md, "A wallet can run one compute job at a time": what a wallet has no active run of, no element of it can witness.
lemma NoActiveOfWallet(c: Compute, wallet: string, x: Run)
  requires !(exists r :: r in c.runs && ((r.wallet == wallet) && isActive(r))) && x in c.runs
  ensures !(x.wallet == wallet && isActive(x))
{
  if x.wallet == wallet && isActive(x) {
    assert exists r :: r in c.runs && ((r.wallet == wallet) && isActive(r));
  }
}

// spec/app/compute/instances.md, "Story: Rent a confidential machine": a map step that keeps identity, never activates a run,
// keeps every pointwise rule, moves phases along the edges and leaves settled runs alone preserves every rule.
lemma MapPreservesRules(before: Compute, g: Run -> Run)
  requires inv(before)
  requires forall x :: x in before.runs ==>
    g(x).id == x.id && g(x).reference == x.reference && g(x).wallet == x.wallet &&
    g(x).kind == x.kind && g(x).spec == x.spec && g(x).minutes == x.minutes && g(x).reserve == x.reserve
  requires forall x :: x in before.runs ==> isActive(g(x)) ==> isActive(x)
  requires forall x :: x in before.runs ==>
    ((g(x).phase.Teardown? || g(x).phase.Settled?) == (!g(x).result.Ongoing?))
  requires forall x :: x in before.runs ==> g(x).kind.Blackboxes? && g(x).phase.Running? ==> g(x).attestation.Verified?
  requires forall x :: x in before.runs ==> g(x).kind.DryDocks? ==> g(x).attestation.Absent?
  requires forall x :: x in before.runs ==> g(x).reserve == quote(g(x).spec, g(x).minutes)
  requires forall x :: x in before.runs ==>
    g(x).charged >= 0 && g(x).charged <= g(x).reserve &&
    (g(x).phase.Settled? || g(x).charged == 0) &&
    (!g(x).phase.Settled? || (g(x).charged + g(x).returned == g(x).reserve && g(x).returned >= 0))
  requires forall x :: x in before.runs ==> g(x).kind.Blackboxes? && !g(x).attestation.Verified? ==> g(x).charged == 0
  requires forall x :: x in before.runs ==> edgeOk(x.phase, g(x).phase)
  requires forall x :: x in before.runs && x.phase.Settled? ==> g(x) == x
  ensures inv(Compute(seq(|before.runs|, i requires 0 <= i < |before.runs| => g(before.runs[i]))))
  ensures stepRunsOnlyMoveForward(before, Compute(seq(|before.runs|, i requires 0 <= i < |before.runs| => g(before.runs[i]))))
  ensures stepSettledStays(before, Compute(seq(|before.runs|, i requires 0 <= i < |before.runs| => g(before.runs[i]))))
{
  var mapped := seq(|before.runs|, i requires 0 <= i < |before.runs| => g(before.runs[i]));
  var after := Compute(mapped);
  forall r | r in after.runs
    ensures (r.phase.Teardown? || r.phase.Settled?) == (!r.result.Ongoing?)
    ensures r.kind == kindOf(r.spec)
    ensures !r.kind.Blackboxes? || !r.phase.Running? || r.attestation.Verified?
    ensures !r.kind.DryDocks? || r.attestation.Absent?
    ensures r.reserve == quote(r.spec, r.minutes)
    ensures r.charged >= 0 && r.charged <= r.reserve && (r.phase.Settled? || r.charged == 0) &&
            (!r.phase.Settled? || (r.charged + r.returned == r.reserve && r.returned >= 0))
    ensures !r.kind.Blackboxes? || r.attestation.Verified? || r.charged == 0
  {
    var i :| 0 <= i < |mapped| && mapped[i] == r;
    assert r == g(before.runs[i]);
    assert before.runs[i] in before.runs;
    RunFacts(before, before.runs[i]);
  }
  assert alwaysResultFollowsPhase(after);
  assert alwaysKindMatchesSpec(after);
  assert alwaysVerifiedToServe(after);
  assert alwaysDocksUnattested(after);
  assert alwaysReserveIsQuoted(after);
  assert alwaysChargesAreConserved(after);
  assert alwaysUnverifiedIsFree(after);

  forall r | r in after.runs
    ensures !(exists o :: o in after.runs && !((!(((isActive(r) && isActive(o)) && (r.wallet == o.wallet))) || (r == o))))
  {
    forall o | o in after.runs
      ensures (!(((isActive(r) && isActive(o)) && (r.wallet == o.wallet)))) || (r == o)
    {
      if isActive(r) && isActive(o) && r.wallet == o.wallet {
        var i :| 0 <= i < |mapped| && mapped[i] == r;
        var j :| 0 <= j < |mapped| && mapped[j] == o;
        assert g(before.runs[i]) == r && g(before.runs[j]) == o;
        assert before.runs[i] in before.runs && before.runs[j] in before.runs;
        assert isActive(before.runs[i]) && isActive(before.runs[j]);
        assert before.runs[i].wallet == before.runs[j].wallet;
        SameWalletActiveRun(before, before.runs[i], before.runs[j]);
      }
    }
  }
  assert alwaysOneActivePerWallet(after);

  forall r | r in after.runs
    ensures !(exists o :: o in after.runs && !(((r.id != o.id) || (r == o))))
  {
    forall o | o in after.runs
      ensures (r.id != o.id) || (r == o)
    {
      if r.id == o.id {
        var i :| 0 <= i < |mapped| && mapped[i] == r;
        var j :| 0 <= j < |mapped| && mapped[j] == o;
        assert g(before.runs[i]) == r && g(before.runs[j]) == o;
        assert before.runs[i] in before.runs && before.runs[j] in before.runs;
        assert before.runs[i].id == before.runs[j].id;
        SameIdSameRun(before, before.runs[i], before.runs[j]);
      }
    }
  }
  assert alwaysIdsAreUnique(after);

  assert forall i :: 0 <= i < |before.runs| ==>
    (((before.runs[i].kind == Kind.Blackboxes) && isActive(g(before.runs[i]))) == (after.runs[i].kind == Kind.Blackboxes && isActive(after.runs[i])));
  ProofLib.FilterLengthPointwise(
    (x: Run) => ((x.kind == Kind.Blackboxes) && isActive(g(x))),
    (r: Run) => ((r.kind == Kind.Blackboxes) && isActive(r)),
    before.runs, after.runs);
  ProofLib.FilterImpLength(
    (x: Run) => ((x.kind == Kind.Blackboxes) && isActive(g(x))),
    (r: Run) => ((r.kind == Kind.Blackboxes) && isActive(r)),
    before.runs);
  assert forall i :: 0 <= i < |before.runs| ==>
    (((before.runs[i].kind == Kind.DryDocks) && isActive(g(before.runs[i]))) == (after.runs[i].kind == Kind.DryDocks && isActive(after.runs[i])));
  ProofLib.FilterLengthPointwise(
    (x: Run) => ((x.kind == Kind.DryDocks) && isActive(g(x))),
    (r: Run) => ((r.kind == Kind.DryDocks) && isActive(r)),
    before.runs, after.runs);
  ProofLib.FilterImpLength(
    (x: Run) => ((x.kind == Kind.DryDocks) && isActive(g(x))),
    (r: Run) => ((r.kind == Kind.DryDocks) && isActive(r)),
    before.runs);
  assert alwaysKindWithinCapacity(after);

  forall rb | rb in before.runs
    ensures !(exists ra :: ra in after.runs && !(((ra.id != rb.id) || edgeOk(rb.phase, ra.phase))))
  {
    forall ra | ra in after.runs
      ensures (ra.id != rb.id) || edgeOk(rb.phase, ra.phase)
    {
      if ra.id == rb.id {
        var i :| 0 <= i < |mapped| && mapped[i] == ra;
        assert g(before.runs[i]) == ra;
        assert before.runs[i] in before.runs;
        assert before.runs[i].id == rb.id;
        SameIdSameRun(before, rb, before.runs[i]);
        assert before.runs[i] == rb && ra == g(rb);
      }
    }
  }
  assert stepRunsOnlyMoveForward(before, after);

  forall r | r in before.runs
    ensures !r.phase.Settled? || r in after.runs
  {
    if r.phase.Settled? {
      var i :| 0 <= i < |before.runs| && before.runs[i] == r;
      assert mapped[i] == g(r) == r;
      assert r in after.runs;
    }
  }
  assert stepSettledStays(before, after);
  assert inv(after);
}

// spec/app/compute/instances.md, "Story: Rent a confidential machine": a map step needs every rule's fact at every run.
lemma AllRunsFacts(c: Compute)
  requires inv(c)
  ensures forall x :: x in c.runs ==>
    ((x.phase.Teardown? || x.phase.Settled?) == (!x.result.Ongoing?)) &&
    (x.kind == kindOf(x.spec)) &&
    (!x.kind.Blackboxes? || !x.phase.Running? || x.attestation.Verified?) &&
    (!x.kind.DryDocks? || x.attestation.Absent?) &&
    (x.reserve == quote(x.spec, x.minutes)) &&
    (x.charged >= 0 && x.charged <= x.reserve && (x.phase.Settled? || x.charged == 0) &&
     (!x.phase.Settled? || (x.charged + x.returned == x.reserve && x.returned >= 0))) &&
    (!x.kind.Blackboxes? || x.attestation.Verified? || x.charged == 0)
{
  forall x | x in c.runs
    ensures ((x.phase.Teardown? || x.phase.Settled?) == (!x.result.Ongoing?)) &&
            (x.kind == kindOf(x.spec)) &&
            (!x.kind.Blackboxes? || !x.phase.Running? || x.attestation.Verified?) &&
            (!x.kind.DryDocks? || x.attestation.Absent?) &&
            (x.reserve == quote(x.spec, x.minutes)) &&
            (x.charged >= 0 && x.charged <= x.reserve && (x.phase.Settled? || x.charged == 0) &&
             (!x.phase.Settled? || (x.charged + x.returned == x.reserve && x.returned >= 0))) &&
            (!x.kind.Blackboxes? || x.attestation.Verified? || x.charged == 0)
  {
    RunFacts(c, x);
  }
}

// spec/app/compute/instances.md, "A wallet opens a run for a supported window and a valid workload"
lemma open_ensures(c: Compute, id: string, reference: string, wallet: string, spec: Workload, minutes: int)
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysOneActivePerWallet(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysKindWithinCapacity(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysIdsAreUnique(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysResultFollowsPhase(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysKindMatchesSpec(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysVerifiedToServe(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysDocksUnattested(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysReserveIsQuoted(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysChargesAreConserved(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> alwaysUnverifiedIsFree(open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> stepRunsOnlyMoveForward(c, open(c, id, reference, wallet, spec, minutes)))
  ensures (inv(c) ==> canOpen(c, id, reference, wallet, spec, minutes) ==> stepSettledStays(c, open(c, id, reference, wallet, spec, minutes)))
{
  if inv(c) && canOpen(c, id, reference, wallet, spec, minutes) {
    var after := open(c, id, reference, wallet, spec, minutes);
    if !(exists r :: r in c.runs && ((r.wallet == wallet) && (r.reference == reference))) {
      var added := Run(id, reference, wallet, kindOf(spec), spec, minutes, quote(spec, minutes), Phase.Queued, Result.Ongoing, (if spec.Blackbox? then Attestation.Pending else Attestation.Absent), false, 0, 0, 0, 0, 0);
      assert after.runs == c.runs + [added];
      CanOpenFacts(c, id, reference, wallet, spec, minutes);
      QuoteNonNeg(hourlyBaseOf(spec), unitOf(spec), minutes * 60);
      assert alwaysIdsAreUnique(c);
      assert alwaysOneActivePerWallet(c);

      forall r | r in after.runs
        ensures (r.phase.Teardown? || r.phase.Settled?) == (!r.result.Ongoing?)
        ensures r.kind == kindOf(r.spec)
        ensures !r.kind.Blackboxes? || !r.phase.Running? || r.attestation.Verified?
        ensures !r.kind.DryDocks? || r.attestation.Absent?
        ensures r.reserve == quote(r.spec, r.minutes)
        ensures r.charged >= 0 && r.charged <= r.reserve && (r.phase.Settled? || r.charged == 0) &&
                (!r.phase.Settled? || (r.charged + r.returned == r.reserve && r.returned >= 0))
        ensures !r.kind.Blackboxes? || r.attestation.Verified? || r.charged == 0
      {
        if r in c.runs {
          RunFacts(c, r);
        } else {
          assert r == added;
        }
      }
      assert alwaysResultFollowsPhase(after);
      assert alwaysKindMatchesSpec(after);
      assert alwaysVerifiedToServe(after);
      assert alwaysDocksUnattested(after);
      assert alwaysReserveIsQuoted(after);
      assert alwaysChargesAreConserved(after);
      assert alwaysUnverifiedIsFree(after);

      forall r | r in after.runs
        ensures !(exists o :: o in after.runs && !((!(((isActive(r) && isActive(o)) && (r.wallet == o.wallet))) || (r == o))))
      {
        forall o | o in after.runs
          ensures (!(((isActive(r) && isActive(o)) && (r.wallet == o.wallet)))) || (r == o)
        {
          if isActive(r) && isActive(o) && r.wallet == o.wallet {
            if r == added {
              if o == added {
              } else {
                assert o in c.runs;
                assert exists x :: x in c.runs && ((x.wallet == wallet) && isActive(x));
                assert false;
              }
            } else if o == added {
              assert r in c.runs;
              assert exists x :: x in c.runs && ((x.wallet == wallet) && isActive(x));
              assert false;
            } else {
              assert r in c.runs && o in c.runs;
              SameWalletActiveRun(c, r, o);
            }
          }
        }
      }
      assert alwaysOneActivePerWallet(after);

      ProofLib.FilterAppend((r: Run) => ((r.kind == Kind.Blackboxes) && isActive(r)), c.runs, added);
      ProofLib.FilterAppend((r: Run) => ((r.kind == Kind.DryDocks) && isActive(r)), c.runs, added);
      assert alwaysKindWithinCapacity(after);

      forall r | r in after.runs
        ensures !(exists o :: o in after.runs && !(((r.id != o.id) || (r == o))))
      {
        forall o | o in after.runs
          ensures (r.id != o.id) || (r == o)
        {
          if r.id == o.id {
            if r == added {
              if o == added {
              } else {
                assert o in c.runs;
                assert exists x :: x in c.runs && (x.id == id);
                assert false;
              }
            } else if o == added {
              assert r in c.runs;
              assert exists x :: x in c.runs && (x.id == id);
              assert false;
            } else {
              assert r in c.runs && o in c.runs;
              SameIdSameRun(c, r, o);
            }
          }
        }
      }
      assert alwaysIdsAreUnique(after);

      forall rb | rb in c.runs
        ensures !(exists ra :: ra in after.runs && !(((ra.id != rb.id) || edgeOk(rb.phase, ra.phase))))
      {
        forall ra | ra in after.runs
          ensures (ra.id != rb.id) || edgeOk(rb.phase, ra.phase)
        {
          if ra.id == rb.id {
            if ra == added {
              assert rb in c.runs;
              assert exists x :: x in c.runs && (x.id == id);
              assert false;
            } else {
              assert ra in c.runs;
              SameIdSameRun(c, rb, ra);
              assert rb == ra;
              assert edgeOk(rb.phase, rb.phase);
            }
          }
        }
      }
      assert stepRunsOnlyMoveForward(c, after);

      forall r | r in c.runs
        ensures !r.phase.Settled? || r in after.runs
      {
      }
      assert stepSettledStays(c, after);
    } else {
      assert after == c;
      forall rb | rb in c.runs
        ensures !(exists ra :: ra in after.runs && !(((ra.id != rb.id) || edgeOk(rb.phase, ra.phase))))
      {
        forall ra | ra in after.runs
          ensures (ra.id != rb.id) || edgeOk(rb.phase, ra.phase)
        {
          if ra.id == rb.id {
            assert ra in c.runs;
            assert alwaysIdsAreUnique(c);
            SameIdSameRun(c, rb, ra);
            assert rb == ra;
            assert edgeOk(rb.phase, rb.phase);
          }
        }
      }
      assert stepRunsOnlyMoveForward(c, after);
      forall r | r in c.runs
        ensures !r.phase.Settled? || r in after.runs
      {
      }
      assert stepSettledStays(c, after);
    }
  }
}

// spec/app/compute/instances.md, "Run ids and a wallet's references are never reused"
lemma lawOpenTwiceOpensOnce_ensures(c: Compute, id: string, reference: string, wallet: string, spec: Workload, minutes: int)
  ensures (lawOpenTwiceOpensOnce(c, id, reference, wallet, spec, minutes) == true)
{
  var once := open(c, id, reference, wallet, spec, minutes);
  if canOpen(c, id, reference, wallet, spec, minutes) && !(exists r :: r in c.runs && ((r.wallet == wallet) && (r.reference == reference))) {
    var added := Run(id, reference, wallet, kindOf(spec), spec, minutes, quote(spec, minutes), Phase.Queued, Result.Ongoing, (if spec.Blackbox? then Attestation.Pending else Attestation.Absent), false, 0, 0, 0, 0, 0);
    assert once.runs == c.runs + [added];
    CanOpenFacts(c, id, reference, wallet, spec, minutes);
    assert added in once.runs;
    assert added.id == id;
    assert exists r :: r in once.runs && (r.id == id);
    assert !(canOpen(once, id, reference, wallet, spec, minutes));
    assert open(once, id, reference, wallet, spec, minutes) == once;
  }
}

// spec/app/compute/instances.md, "The provider launches a queued run"
lemma launch_ensures(c: Compute, id: string)
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysOneActivePerWallet(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysKindWithinCapacity(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysIdsAreUnique(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysResultFollowsPhase(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysKindMatchesSpec(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysVerifiedToServe(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysDocksUnattested(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysReserveIsQuoted(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysChargesAreConserved(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> alwaysUnverifiedIsFree(launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> stepRunsOnlyMoveForward(c, launch(c, id)))
  ensures (inv(c) ==> canLaunch(c, id) ==> stepSettledStays(c, launch(c, id)))
{
  if inv(c) && canLaunch(c, id) {
    var g := (r: Run) => (if (r.id == id) then r.(phase := Phase.Provisioning) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := launch(c, id);
    assert after == Compute(mapped);
    var w :| w in c.runs && ((w.id == id) && w.phase.Queued?);
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A queued run that never launches settles for nothing"
lemma abandon_ensures(c: Compute, id: string, result: Result)
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysOneActivePerWallet(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysKindWithinCapacity(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysIdsAreUnique(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysResultFollowsPhase(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysKindMatchesSpec(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysVerifiedToServe(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysDocksUnattested(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysReserveIsQuoted(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysChargesAreConserved(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> alwaysUnverifiedIsFree(abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> stepRunsOnlyMoveForward(c, abandon(c, id, result)))
  ensures (inv(c) ==> canAbandon(c, id, result) ==> stepSettledStays(c, abandon(c, id, result)))
{
  if inv(c) && canAbandon(c, id, result) {
    var g := (r: Run) => (if (r.id == id) then settleFree(r, result) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := abandon(c, id, result);
    assert after == Compute(mapped);
    var w :| w in c.runs && (((w.id == id) && w.phase.Queued?) && (result.Expired? || (result.Stopped? && w.stopRequested)));
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A provider that declines settles the run failed at no charge"
lemma decline_ensures(c: Compute, id: string)
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysOneActivePerWallet(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysKindWithinCapacity(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysIdsAreUnique(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysResultFollowsPhase(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysKindMatchesSpec(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysVerifiedToServe(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysDocksUnattested(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysReserveIsQuoted(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysChargesAreConserved(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> alwaysUnverifiedIsFree(decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> stepRunsOnlyMoveForward(c, decline(c, id)))
  ensures (inv(c) ==> canDecline(c, id) ==> stepSettledStays(c, decline(c, id)))
{
  if inv(c) && canDecline(c, id) {
    var g := (r: Run) => (if (r.id == id) then settleFree(r, Result.Failed) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := decline(c, id);
    assert after == Compute(mapped);
    var w :| w in c.runs && ((w.id == id) && w.phase.Provisioning?);
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A Blackbox only serves inference once its attestation is verified"
lemma attest_ensures(c: Compute, id: string)
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysOneActivePerWallet(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysKindWithinCapacity(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysIdsAreUnique(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysResultFollowsPhase(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysKindMatchesSpec(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysVerifiedToServe(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysDocksUnattested(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysReserveIsQuoted(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysChargesAreConserved(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> alwaysUnverifiedIsFree(attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> stepRunsOnlyMoveForward(c, attest(c, id)))
  ensures (inv(c) ==> canAttest(c, id) ==> stepSettledStays(c, attest(c, id)))
{
  if inv(c) && canAttest(c, id) {
    var g := (r: Run) => (if (r.id == id) then r.(phase := Phase.Running, attestation := Attestation.Verified) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := attest(c, id);
    assert after == Compute(mapped);
    var w :| w in c.runs && ((((w.id == id) && w.phase.Provisioning?) && w.kind.Blackboxes?) && w.attestation.Pending?);
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A Blackbox that cannot be verified tears down failed"
lemma reject_ensures(c: Compute, id: string)
  ensures (inv(c) ==> canReject(c, id) ==> alwaysOneActivePerWallet(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysKindWithinCapacity(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysIdsAreUnique(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysResultFollowsPhase(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysKindMatchesSpec(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysVerifiedToServe(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysDocksUnattested(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysReserveIsQuoted(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysChargesAreConserved(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> alwaysUnverifiedIsFree(reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> stepRunsOnlyMoveForward(c, reject(c, id)))
  ensures (inv(c) ==> canReject(c, id) ==> stepSettledStays(c, reject(c, id)))
{
  if inv(c) && canReject(c, id) {
    var g := (r: Run) => (if (r.id == id) then r.(attestation := Attestation.Rejected, phase := Phase.Teardown, result := Result.Failed) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := reject(c, id);
    assert after == Compute(mapped);
    var w :| w in c.runs && ((((w.id == id) && w.phase.Provisioning?) && w.kind.Blackboxes?) && w.attestation.Pending?);
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A Dry Dock runs once its build starts"
lemma work_ensures(c: Compute, id: string)
  ensures (inv(c) ==> canWork(c, id) ==> alwaysOneActivePerWallet(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysKindWithinCapacity(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysIdsAreUnique(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysResultFollowsPhase(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysKindMatchesSpec(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysVerifiedToServe(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysDocksUnattested(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysReserveIsQuoted(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysChargesAreConserved(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> alwaysUnverifiedIsFree(work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> stepRunsOnlyMoveForward(c, work(c, id)))
  ensures (inv(c) ==> canWork(c, id) ==> stepSettledStays(c, work(c, id)))
{
  if inv(c) && canWork(c, id) {
    var g := (r: Run) => (if (r.id == id) then r.(phase := Phase.Running) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := work(c, id);
    assert after == Compute(mapped);
    var w :| w in c.runs && (((w.id == id) && w.phase.Provisioning?) && w.kind.DryDocks?);
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A running or provisioning run can be asked to stop"
lemma stop_ensures(c: Compute, id: string)
  ensures (inv(c) ==> canStop(c, id) ==> alwaysOneActivePerWallet(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysKindWithinCapacity(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysIdsAreUnique(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysResultFollowsPhase(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysKindMatchesSpec(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysVerifiedToServe(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysDocksUnattested(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysReserveIsQuoted(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysChargesAreConserved(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> alwaysUnverifiedIsFree(stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> stepRunsOnlyMoveForward(c, stop(c, id)))
  ensures (inv(c) ==> canStop(c, id) ==> stepSettledStays(c, stop(c, id)))
{
  if inv(c) && canStop(c, id) {
    var g := (r: Run) => (if (r.id == id) then r.(stopRequested := true) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := stop(c, id);
    assert after == Compute(mapped);
    var w :| w in c.runs && (((w.id == id) && !(w.stopRequested)) && ((w.phase.Queued? || w.phase.Provisioning?) || w.phase.Running?));
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "A provisioning or running run enters teardown with its outcome"
lemma tearDown_ensures(c: Compute, id: string, result: Result)
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysOneActivePerWallet(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysKindWithinCapacity(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysIdsAreUnique(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysResultFollowsPhase(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysKindMatchesSpec(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysVerifiedToServe(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysDocksUnattested(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysReserveIsQuoted(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysChargesAreConserved(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> alwaysUnverifiedIsFree(tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> stepRunsOnlyMoveForward(c, tearDown(c, id, result)))
  ensures (inv(c) ==> canTearDown(c, id, result) ==> stepSettledStays(c, tearDown(c, id, result)))
{
  if inv(c) && canTearDown(c, id, result) {
    var g := (r: Run) => (if (r.id == id) then r.(phase := Phase.Teardown, result := result) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := tearDown(c, id, result);
    assert after == Compute(mapped);
    var w :| w in c.runs && (((w.id == id) && (w.phase.Provisioning? || w.phase.Running?)) && (((result.Failed? || result.Expired?) || (result.Stopped? && w.stopRequested)) || (result.Completed? && w.kind.DryDocks?)));
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "Teardown settles the hold against metered time"
lemma settleRun_ensures(c: Compute, id: string, seconds: int, metered: int)
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysOneActivePerWallet(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysKindWithinCapacity(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysIdsAreUnique(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysResultFollowsPhase(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysKindMatchesSpec(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysVerifiedToServe(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysDocksUnattested(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysReserveIsQuoted(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysChargesAreConserved(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> alwaysUnverifiedIsFree(settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> stepRunsOnlyMoveForward(c, settleRun(c, id, seconds, metered)))
  ensures (inv(c) ==> canSettleRun(c, id, seconds, metered) ==> stepSettledStays(c, settleRun(c, id, seconds, metered)))
{
  if inv(c) && canSettleRun(c, id, seconds, metered) {
    var g := (r: Run) => (if (r.id == id) then settledCharge(r, seconds, metered) else r);
    var mapped := seq(|c.runs|, i requires 0 <= i < |c.runs| => g(c.runs[i]));
    var after := settleRun(c, id, seconds, metered);
    assert after == Compute(mapped);
    var w :| w in c.runs && ((w.id == id) && w.phase.Teardown?);
    assert forall x :: x in c.runs && x.id == id ==> x == w by {
      forall x | x in c.runs && x.id == id ensures x == w { UniqueById(c, x, w); }
    }
    AllRunsFacts(c);
    RunFacts(c, w);
    ChargeFields(w, seconds, metered);
    MapPreservesRules(c, g);
  }
}

// spec/app/compute/instances.md, "Metered time beyond the window is never charged"
lemma lawReserveCoversCharge_ensures(r: Run, seconds: int, metered: int)
  ensures (lawReserveCoversCharge(r, seconds, metered) == true)
{
  if seconds >= 0 && metered >= 0 && r.reserve == quote(r.spec, r.minutes) {
    ChargeLeQuote(r, seconds, metered);
    assert settledCharge(r, seconds, metered).charged <= r.reserve;
  }
}

// spec/app/compute/instances.md, "A run that counts nothing is billed nothing"
lemma lawZeroSecondsIsFree_ensures(rate: int, unit: int)
  ensures (lawZeroSecondsIsFree(rate, unit) == true)
{
  if unit > 0 && rate >= 0 {
    assert quoteFor(rate, unit, 0).base == 0;
    assert quoteFor(rate, unit, 0).total == 0;
  }
}
