// spec/app/usage.md, "Every row stays well formed and uniquely identified" and the step
// rules: the log's filters as ProofLib.Filter, so the library's lemmas apply.

lemma rowWithIdIs(u: Usage, id: string)
  ensures rowWithId(u, id) == ProofLib.Filter((r: Row) => (r.id == id), u.rows)
{
}

lemma rowWithIdAll(u: Usage, id: string)
  ensures forall a :: (a in rowWithId(u, id)) == (a in u.rows && (a.id == id))
{
  forall a ensures (a in rowWithId(u, id)) == (a in u.rows && (a.id == id)) {
    ProofLib.FilterMember((r: Row) => (r.id == id), u.rows, a);
  }
}

lemma wellP(u: Usage)
  ensures alwaysRowsAreWellFormed(u) == (!(exists r :: r in u.rows && !((r.id != "") && (r.keyName != "") && (r.model != "") && (r.time >= 0) && (r.input >= 0) && (r.output >= 0) && (r.cost >= 0) && (r.cached >= -1) && (r.cached <= r.input) && (r.providerMs >= -1))) && !(exists r :: r in u.rows && !((|ProofLib.Filter((o: Row) => (o.id == r.id), u.rows)| == 1))))
{
}

lemma pendingP(u: Usage)
  ensures alwaysPendingIsClean(u) == !(exists r :: r in u.rows && !((!r.status.Pending?) || ((((r.input == 0) && (r.output == 0)) && (r.cached == -1)) && (r.providerMs == -1))))
{
}

lemma sameIdIsSame(u: Usage, a: Row, b: Row)
  requires alwaysRowsAreWellFormed(u)
  requires a in u.rows && b in u.rows && (a.id == b.id)
  ensures a == b
{
  wellP(u);
  ProofLib.FilterMember((o: Row) => (o.id == a.id), u.rows, a);
  ProofLib.FilterMember((o: Row) => (o.id == a.id), u.rows, b);
  assert a == ProofLib.Filter((o: Row) => (o.id == a.id), u.rows)[0];
  assert b == ProofLib.Filter((o: Row) => (o.id == a.id), u.rows)[0];
}

lemma rowsWFFromElems(after: Usage)
  requires forall i :: 0 <= i < |after.rows| ==> ((after.rows[i].id != "") && (after.rows[i].keyName != "") && (after.rows[i].model != "") && (after.rows[i].time >= 0) && (after.rows[i].input >= 0) && (after.rows[i].output >= 0) && (after.rows[i].cost >= 0) && (after.rows[i].cached >= -1) && (after.rows[i].cached <= after.rows[i].input) && (after.rows[i].providerMs >= -1))
  ensures !(exists r :: r in after.rows && !((r.id != "") && (r.keyName != "") && (r.model != "") && (r.time >= 0) && (r.input >= 0) && (r.output >= 0) && (r.cost >= 0) && (r.cached >= -1) && (r.cached <= r.input) && (r.providerMs >= -1)))
{
  forall r | r in after.rows
    ensures (r.id != "") && (r.keyName != "") && (r.model != "") && (r.time >= 0) && (r.input >= 0) && (r.output >= 0) && (r.cost >= 0) && (r.cached >= -1) && (r.cached <= r.input) && (r.providerMs >= -1)
  {
    var i :| 0 <= i < |after.rows| && after.rows[i] == r;
  }
}

lemma pendingFromElems(after: Usage)
  requires forall i :: 0 <= i < |after.rows| ==> ((!after.rows[i].status.Pending?) || ((((after.rows[i].input == 0) && (after.rows[i].output == 0)) && (after.rows[i].cached == -1)) && (after.rows[i].providerMs == -1)))
  ensures alwaysPendingIsClean(after)
{
  forall r | r in after.rows
    ensures (!r.status.Pending?) || ((((r.input == 0) && (r.output == 0)) && (r.cached == -1)) && (r.providerMs == -1))
  {
    var i :| 0 <= i < |after.rows| && after.rows[i] == r;
  }
}

// A map that keeps every row id keeps the per-row id count of one.

lemma uniqIdsAfter(u: Usage, after: Usage)
  requires alwaysRowsAreWellFormed(u)
  requires |after.rows| == |u.rows|
  requires forall j :: 0 <= j < |u.rows| ==> (after.rows[j].id == u.rows[j].id)
  ensures !(exists r :: r in after.rows && !((|ProofLib.Filter((o: Row) => (o.id == r.id), after.rows)| == 1)))
{
  forall i | 0 <= i < |after.rows|
    ensures |ProofLib.Filter((o: Row) => (o.id == after.rows[i].id), after.rows)| == 1
  {
    assert u.rows[i] in u.rows;
    assert |ProofLib.Filter((o: Row) => (o.id == u.rows[i].id), u.rows)| == 1;
    ProofLib.FilterLengthPointwise((o: Row) => (o.id == u.rows[i].id), (o: Row) => (o.id == u.rows[i].id), u.rows, after.rows);
    ProofLib.FilterSamePredicate((o: Row) => (o.id == u.rows[i].id), (o: Row) => (o.id == after.rows[i].id), after.rows);
  }
}

// Appending one row whose id is fresh keeps the per-row id count of one.

lemma uniqIdsAppend(u: Usage, after: Usage, x: Row)
  requires alwaysRowsAreWellFormed(u)
  requires after.rows == u.rows + [x]
  requires !(exists r :: r in u.rows && !(r.id != x.id))
  ensures !(exists r :: r in after.rows && !((|ProofLib.Filter((o: Row) => (o.id == r.id), after.rows)| == 1)))
{
  forall t | t in after.rows
    ensures |ProofLib.Filter((o: Row) => (o.id == t.id), after.rows)| == 1
  {
    ProofLib.FilterAppend((o: Row) => (o.id == t.id), u.rows, x);
    if t == x {
      ProofLib.FilterNone((o: Row) => (o.id == t.id), u.rows);
    } else {
      assert t in u.rows;
      assert t.id != x.id;
      assert |ProofLib.Filter((o: Row) => (o.id == t.id), u.rows)| == 1;
    }
  }
}

// stepRowsOnlyGrow: every before-row's id has exactly one after-row.

lemma rowsOnlyGrowMap(u: Usage, after: Usage)
  requires alwaysRowsAreWellFormed(u)
  requires |after.rows| == |u.rows|
  requires forall j :: 0 <= j < |u.rows| ==> (after.rows[j].id == u.rows[j].id)
  ensures stepRowsOnlyGrow(u, after)
{
  forall r | r in u.rows
    ensures |rowWithId(after, r.id)| == 1
  {
    rowWithIdIs(after, r.id);
    assert |ProofLib.Filter((o: Row) => (o.id == r.id), u.rows)| == 1;
    ProofLib.FilterLengthPointwise((o: Row) => (o.id == r.id), (o: Row) => (o.id == r.id), u.rows, after.rows);
  }
}

lemma rowsOnlyGrowAppend(u: Usage, after: Usage, x: Row)
  requires alwaysRowsAreWellFormed(u)
  requires after.rows == u.rows + [x]
  requires !(exists r :: r in u.rows && !(r.id != x.id))
  ensures stepRowsOnlyGrow(u, after)
{
  forall r | r in u.rows
    ensures |rowWithId(after, r.id)| == 1
  {
    rowWithIdIs(after, r.id);
    assert r.id != x.id;
    assert |ProofLib.Filter((o: Row) => (o.id == r.id), u.rows)| == 1;
    ProofLib.FilterAppend((o: Row) => (o.id == r.id), u.rows, x);
  }
}

// stepSettledRowsAreFixed: a non-pending before-row is literally the same after-row.

lemma settledFixedMap(u: Usage, after: Usage)
  requires alwaysRowsAreWellFormed(u)
  requires |after.rows| == |u.rows|
  requires forall j :: 0 <= j < |u.rows| ==> (after.rows[j].id == u.rows[j].id)
  requires forall j :: 0 <= j < |u.rows| ==> (u.rows[j].status.Pending? || (after.rows[j] == u.rows[j]))
  ensures stepSettledRowsAreFixed(u, after)
{
  forall r | r in u.rows && !r.status.Pending?
    ensures !(exists a :: a in rowWithId(after, r.id) && !((a == r)))
  {
    forall a | a in rowWithId(after, r.id)
      ensures a == r
    {
      rowWithIdAll(after, r.id);
      var j :| 0 <= j < |after.rows| && after.rows[j] == a;
      assert u.rows[j].id == r.id;
      sameIdIsSame(u, u.rows[j], r);
      assert after.rows[j] == u.rows[j];
    }
  }
}

lemma settledFixedAppend(u: Usage, after: Usage, x: Row)
  requires alwaysRowsAreWellFormed(u)
  requires after.rows == u.rows + [x]
  requires !(exists r :: r in u.rows && !(r.id != x.id))
  ensures stepSettledRowsAreFixed(u, after)
{
  forall r | r in u.rows && !r.status.Pending?
    ensures !(exists a :: a in rowWithId(after, r.id) && !((a == r)))
  {
    forall a | a in rowWithId(after, r.id)
      ensures a == r
    {
      rowWithIdAll(after, r.id);
      assert a.id != x.id;
      assert a in u.rows;
      sameIdIsSame(u, a, r);
    }
  }
}

// stepPendingSettles: a pending before-row's after-row is identical or a settlement of it.

lemma pendingSettlesMap(u: Usage, after: Usage)
  requires alwaysRowsAreWellFormed(u)
  requires |after.rows| == |u.rows|
  requires forall j :: 0 <= j < |u.rows| ==> (after.rows[j].id == u.rows[j].id)
  requires forall j :: 0 <= j < |u.rows| ==> ((after.rows[j] == u.rows[j]) || ((!after.rows[j].status.Pending?) && (after.rows[j].id == u.rows[j].id) && (after.rows[j].time == u.rows[j].time) && (after.rows[j].keyName == u.rows[j].keyName) && (after.rows[j].keyId == u.rows[j].keyId) && (after.rows[j].project == u.rows[j].project) && (after.rows[j].model == u.rows[j].model) && (after.rows[j].provider == u.rows[j].provider)))
  ensures stepPendingSettles(u, after)
{
  forall r | r in u.rows && r.status.Pending?
    ensures !(exists a :: a in rowWithId(after, r.id) && !((a == r) || ((!a.status.Pending?) && (a.id == r.id) && (a.time == r.time) && (a.keyName == r.keyName) && (a.keyId == r.keyId) && (a.project == r.project) && (a.model == r.model) && (a.provider == r.provider))))
  {
    forall a | a in rowWithId(after, r.id)
      ensures (a == r) || ((!a.status.Pending?) && (a.id == r.id) && (a.time == r.time) && (a.keyName == r.keyName) && (a.keyId == r.keyId) && (a.project == r.project) && (a.model == r.model) && (a.provider == r.provider))
    {
      rowWithIdAll(after, r.id);
      var j :| 0 <= j < |after.rows| && after.rows[j] == a;
      assert u.rows[j].id == r.id;
      sameIdIsSame(u, u.rows[j], r);
    }
  }
}

lemma pendingSettlesAppend(u: Usage, after: Usage, x: Row)
  requires alwaysRowsAreWellFormed(u)
  requires after.rows == u.rows + [x]
  requires !(exists r :: r in u.rows && !(r.id != x.id))
  ensures stepPendingSettles(u, after)
{
  forall r | r in u.rows && r.status.Pending?
    ensures !(exists a :: a in rowWithId(after, r.id) && !((a == r) || ((!a.status.Pending?) && (a.id == r.id) && (a.time == r.time) && (a.keyName == r.keyName) && (a.keyId == r.keyId) && (a.project == r.project) && (a.model == r.model) && (a.provider == r.provider))))
  {
    forall a | a in rowWithId(after, r.id)
      ensures (a == r) || ((!a.status.Pending?) && (a.id == r.id) && (a.time == r.time) && (a.keyName == r.keyName) && (a.keyId == r.keyId) && (a.project == r.project) && (a.model == r.model) && (a.provider == r.provider))
    {
      rowWithIdAll(after, r.id);
      assert a.id != x.id;
      assert a in u.rows;
      sameIdIsSame(u, a, r);
    }
  }
}

// A FoldLeft over one more element applies the step once at the end.

lemma foldLeftAppendPartial<A, T>(f: (A, T) -> A, init: A, xs: seq<T>, last: T)
  ensures Std.Collections.Seq.FoldLeft(f, init, xs + [last]) == f(Std.Collections.Seq.FoldLeft(f, init, xs), last)
  decreases |xs|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |xs| > 0 {
    assert (xs + [last])[1..] == xs[1..] + [last];
    foldLeftAppendPartial(f, f(init, xs[0]), xs[1..], last);
  }
}

// A Totals field that grows by f2(0, r) each row equals the int fold of f2.

lemma foldFieldIsCostFold<A>(f1: (A, Row) -> A, f2: (int, Row) -> int, sel: A -> int, init: A, xs: seq<Row>)
  requires forall a, r :: sel(f1(a, r)) == sel(a) + f2(0, r)
  requires forall a, r :: f2(a, r) == a + f2(0, r)
  ensures sel(Std.Collections.Seq.FoldLeft(f1, init, xs)) == sel(init) + Std.Collections.Seq.FoldLeft(f2, 0, xs)
  decreases |xs|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |xs| > 0 {
    var last := xs[|xs| - 1];
    assert xs[..|xs| - 1] + [last] == xs;
    foldFieldIsCostFold(f1, f2, sel, init, xs[..|xs| - 1]);
    foldLeftAppendPartial(f1, init, xs[..|xs| - 1], last);
    foldLeftAppendPartial(f2, 0, xs[..|xs| - 1], last);
  }
}

// A step that adds one counts the rows.

lemma foldCountIsLen(f: (int, Row) -> int, init: int, xs: seq<Row>)
  requires forall a, r :: f(a, r) == a + 1
  ensures Std.Collections.Seq.FoldLeft(f, init, xs) == init + |xs|
  decreases |xs|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |xs| > 0 {
    var last := xs[|xs| - 1];
    assert xs[..|xs| - 1] + [last] == xs;
    foldCountIsLen(f, init, xs[..|xs| - 1]);
    foldLeftAppendPartial(f, init, xs[..|xs| - 1], last);
  }
}

// record: the log gains one pending row whose fields are clean.

lemma record_ensures(u: Usage, id: string, time: int, keyName: string, keyId: string, project: string, model: string, provider: Provider, cost: int)
  ensures (inv(u) ==> canRecord(u, id, time, keyName, keyId, project, model, provider, cost) ==> alwaysPendingIsClean(record(u, id, time, keyName, keyId, project, model, provider, cost)))
  ensures (inv(u) ==> canRecord(u, id, time, keyName, keyId, project, model, provider, cost) ==> alwaysRowsAreWellFormed(record(u, id, time, keyName, keyId, project, model, provider, cost)))
  ensures (inv(u) ==> canRecord(u, id, time, keyName, keyId, project, model, provider, cost) ==> stepRowsOnlyGrow(u, record(u, id, time, keyName, keyId, project, model, provider, cost)))
  ensures (inv(u) ==> canRecord(u, id, time, keyName, keyId, project, model, provider, cost) ==> stepSettledRowsAreFixed(u, record(u, id, time, keyName, keyId, project, model, provider, cost)))
  ensures (inv(u) ==> canRecord(u, id, time, keyName, keyId, project, model, provider, cost) ==> stepPendingSettles(u, record(u, id, time, keyName, keyId, project, model, provider, cost)))
{
  if inv(u) && canRecord(u, id, time, keyName, keyId, project, model, provider, cost) {
    var after := record(u, id, time, keyName, keyId, project, model, provider, cost);
    var x := Row(id, time, keyName, keyId, project, model, provider, 0, 0, -1, cost, -1, Status.Pending);
    assert after.rows == u.rows + [x];
    wellP(u);
    pendingP(u);
    forall i | 0 <= i < |after.rows|
      ensures (after.rows[i].id != "") && (after.rows[i].keyName != "") && (after.rows[i].model != "") && (after.rows[i].time >= 0) && (after.rows[i].input >= 0) && (after.rows[i].output >= 0) && (after.rows[i].cost >= 0) && (after.rows[i].cached >= -1) && (after.rows[i].cached <= after.rows[i].input) && (after.rows[i].providerMs >= -1)
      ensures (!after.rows[i].status.Pending?) || ((((after.rows[i].input == 0) && (after.rows[i].output == 0)) && (after.rows[i].cached == -1)) && (after.rows[i].providerMs == -1))
    {
      if after.rows[i] != x {
        assert after.rows[i] in u.rows;
      }
    }
    rowsWFFromElems(after);
    pendingFromElems(after);
    uniqIdsAppend(u, after, x);
    wellP(after);
    pendingP(after);
    assert alwaysRowsAreWellFormed(after);
    assert alwaysPendingIsClean(after);
    rowsOnlyGrowAppend(u, after, x);
    assert stepRowsOnlyGrow(u, after);
    settledFixedAppend(u, after, x);
    assert stepSettledRowsAreFixed(u, after);
    pendingSettlesAppend(u, after, x);
    assert stepPendingSettles(u, after);
  }
}

// charge: the pending row with the id becomes complete with the reported usage.

lemma charge_ensures(u: Usage, id: string, input: int, output: int, cached: int, cost: int, providerMs: int)
  ensures (inv(u) ==> canCharge(u, id, input, output, cached, cost, providerMs) ==> alwaysPendingIsClean(charge(u, id, input, output, cached, cost, providerMs)))
  ensures (inv(u) ==> canCharge(u, id, input, output, cached, cost, providerMs) ==> alwaysRowsAreWellFormed(charge(u, id, input, output, cached, cost, providerMs)))
  ensures (inv(u) ==> canCharge(u, id, input, output, cached, cost, providerMs) ==> stepRowsOnlyGrow(u, charge(u, id, input, output, cached, cost, providerMs)))
  ensures (inv(u) ==> canCharge(u, id, input, output, cached, cost, providerMs) ==> stepSettledRowsAreFixed(u, charge(u, id, input, output, cached, cost, providerMs)))
  ensures (inv(u) ==> canCharge(u, id, input, output, cached, cost, providerMs) ==> stepPendingSettles(u, charge(u, id, input, output, cached, cost, providerMs)))
{
  if inv(u) && canCharge(u, id, input, output, cached, cost, providerMs) {
    var after := charge(u, id, input, output, cached, cost, providerMs);
    var tr :| tr in rowWithId(u, id) && tr.status.Pending?;
    rowWithIdAll(u, id);
    assert tr in u.rows && tr.id == id;
    wellP(u);
    pendingP(u);
    forall i | 0 <= i < |after.rows|
      ensures (after.rows[i].id != "") && (after.rows[i].keyName != "") && (after.rows[i].model != "") && (after.rows[i].time >= 0) && (after.rows[i].input >= 0) && (after.rows[i].output >= 0) && (after.rows[i].cost >= 0) && (after.rows[i].cached >= -1) && (after.rows[i].cached <= after.rows[i].input) && (after.rows[i].providerMs >= -1)
      ensures (!after.rows[i].status.Pending?) || ((((after.rows[i].input == 0) && (after.rows[i].output == 0)) && (after.rows[i].cached == -1)) && (after.rows[i].providerMs == -1))
      ensures after.rows[i].id == u.rows[i].id
      ensures (u.rows[i].status.Pending? || (after.rows[i] == u.rows[i]))
      ensures ((after.rows[i] == u.rows[i]) || ((!after.rows[i].status.Pending?) && (after.rows[i].id == u.rows[i].id) && (after.rows[i].time == u.rows[i].time) && (after.rows[i].keyName == u.rows[i].keyName) && (after.rows[i].keyId == u.rows[i].keyId) && (after.rows[i].project == u.rows[i].project) && (after.rows[i].model == u.rows[i].model) && (after.rows[i].provider == u.rows[i].provider)))
    {
      if u.rows[i].id == id {
        var r := u.rows[i];
        var a := after.rows[i];
        sameIdIsSame(u, r, tr);
        assert a == r.(input := input, output := output, cached := cached, cost := cost, providerMs := providerMs, status := Status.Complete);
      }
    }
    rowsWFFromElems(after);
    pendingFromElems(after);
    uniqIdsAfter(u, after);
    wellP(after);
    pendingP(after);
    assert alwaysRowsAreWellFormed(after);
    assert alwaysPendingIsClean(after);
    rowsOnlyGrowMap(u, after);
    assert stepRowsOnlyGrow(u, after);
    settledFixedMap(u, after);
    assert stepSettledRowsAreFixed(u, after);
    pendingSettlesMap(u, after);
    assert stepPendingSettles(u, after);
  }
}

// release: the pending row with the id becomes failed.

lemma release_ensures(u: Usage, id: string)
  ensures (inv(u) ==> canRelease(u, id) ==> alwaysPendingIsClean(release(u, id)))
  ensures (inv(u) ==> canRelease(u, id) ==> alwaysRowsAreWellFormed(release(u, id)))
  ensures (inv(u) ==> canRelease(u, id) ==> stepRowsOnlyGrow(u, release(u, id)))
  ensures (inv(u) ==> canRelease(u, id) ==> stepSettledRowsAreFixed(u, release(u, id)))
  ensures (inv(u) ==> canRelease(u, id) ==> stepPendingSettles(u, release(u, id)))
{
  if inv(u) && canRelease(u, id) {
    var after := release(u, id);
    var tr :| tr in rowWithId(u, id) && tr.status.Pending?;
    rowWithIdAll(u, id);
    assert tr in u.rows && tr.id == id;
    wellP(u);
    pendingP(u);
    forall i | 0 <= i < |after.rows|
      ensures (after.rows[i].id != "") && (after.rows[i].keyName != "") && (after.rows[i].model != "") && (after.rows[i].time >= 0) && (after.rows[i].input >= 0) && (after.rows[i].output >= 0) && (after.rows[i].cost >= 0) && (after.rows[i].cached >= -1) && (after.rows[i].cached <= after.rows[i].input) && (after.rows[i].providerMs >= -1)
      ensures (!after.rows[i].status.Pending?) || ((((after.rows[i].input == 0) && (after.rows[i].output == 0)) && (after.rows[i].cached == -1)) && (after.rows[i].providerMs == -1))
      ensures after.rows[i].id == u.rows[i].id
      ensures (u.rows[i].status.Pending? || (after.rows[i] == u.rows[i]))
      ensures ((after.rows[i] == u.rows[i]) || ((!after.rows[i].status.Pending?) && (after.rows[i].id == u.rows[i].id) && (after.rows[i].time == u.rows[i].time) && (after.rows[i].keyName == u.rows[i].keyName) && (after.rows[i].keyId == u.rows[i].keyId) && (after.rows[i].project == u.rows[i].project) && (after.rows[i].model == u.rows[i].model) && (after.rows[i].provider == u.rows[i].provider)))
    {
      if u.rows[i].id == id {
        var r := u.rows[i];
        var a := after.rows[i];
        sameIdIsSame(u, r, tr);
        assert a == r.(status := Status.Failed);
      }
    }
    rowsWFFromElems(after);
    pendingFromElems(after);
    uniqIdsAfter(u, after);
    wellP(after);
    pendingP(after);
    assert alwaysRowsAreWellFormed(after);
    assert alwaysPendingIsClean(after);
    rowsOnlyGrowMap(u, after);
    assert stepRowsOnlyGrow(u, after);
    settledFixedMap(u, after);
    assert stepSettledRowsAreFixed(u, after);
    pendingSettlesMap(u, after);
    assert stepPendingSettles(u, after);
  }
}

// unreported: the pending row with the id becomes unreported.

lemma unreported_ensures(u: Usage, id: string)
  ensures (inv(u) ==> canUnreported(u, id) ==> alwaysPendingIsClean(unreported(u, id)))
  ensures (inv(u) ==> canUnreported(u, id) ==> alwaysRowsAreWellFormed(unreported(u, id)))
  ensures (inv(u) ==> canUnreported(u, id) ==> stepRowsOnlyGrow(u, unreported(u, id)))
  ensures (inv(u) ==> canUnreported(u, id) ==> stepSettledRowsAreFixed(u, unreported(u, id)))
  ensures (inv(u) ==> canUnreported(u, id) ==> stepPendingSettles(u, unreported(u, id)))
{
  if inv(u) && canUnreported(u, id) {
    var after := unreported(u, id);
    var tr :| tr in rowWithId(u, id) && tr.status.Pending?;
    rowWithIdAll(u, id);
    assert tr in u.rows && tr.id == id;
    wellP(u);
    pendingP(u);
    forall i | 0 <= i < |after.rows|
      ensures (after.rows[i].id != "") && (after.rows[i].keyName != "") && (after.rows[i].model != "") && (after.rows[i].time >= 0) && (after.rows[i].input >= 0) && (after.rows[i].output >= 0) && (after.rows[i].cost >= 0) && (after.rows[i].cached >= -1) && (after.rows[i].cached <= after.rows[i].input) && (after.rows[i].providerMs >= -1)
      ensures (!after.rows[i].status.Pending?) || ((((after.rows[i].input == 0) && (after.rows[i].output == 0)) && (after.rows[i].cached == -1)) && (after.rows[i].providerMs == -1))
      ensures after.rows[i].id == u.rows[i].id
      ensures (u.rows[i].status.Pending? || (after.rows[i] == u.rows[i]))
      ensures ((after.rows[i] == u.rows[i]) || ((!after.rows[i].status.Pending?) && (after.rows[i].id == u.rows[i].id) && (after.rows[i].time == u.rows[i].time) && (after.rows[i].keyName == u.rows[i].keyName) && (after.rows[i].keyId == u.rows[i].keyId) && (after.rows[i].project == u.rows[i].project) && (after.rows[i].model == u.rows[i].model) && (after.rows[i].provider == u.rows[i].provider)))
    {
      if u.rows[i].id == id {
        var r := u.rows[i];
        var a := after.rows[i];
        sameIdIsSame(u, r, tr);
        assert a == r.(status := Status.Unreported);
      }
    }
    rowsWFFromElems(after);
    pendingFromElems(after);
    uniqIdsAfter(u, after);
    wellP(after);
    pendingP(after);
    assert alwaysRowsAreWellFormed(after);
    assert alwaysPendingIsClean(after);
    rowsOnlyGrowMap(u, after);
    assert stepRowsOnlyGrow(u, after);
    settledFixedMap(u, after);
    assert stepSettledRowsAreFixed(u, after);
    pendingSettlesMap(u, after);
    assert stepPendingSettles(u, after);
  }
}

// The rollups in Totals are the plain folds the spec names.

lemma lawSpendIsCompleteCost_ensures(rows: seq<Row>)
  ensures (lawSpendIsCompleteCost(rows) == true)
{
  foldFieldIsCostFold((t: Totals, r: Row) => Totals((t.requests + 1), (t.complete + (if r.status.Complete? then 1 else 0)), (t.failed + (if r.status.Failed? then 1 else 0)), (t.input + r.input), (t.output + r.output), (t.spend + (if r.status.Complete? then r.cost else 0)), (t.held + (if (r.status.Pending? || r.status.Unreported?) then r.cost else 0)), (t.cached + (if (r.cached >= 0) then r.cached else 0)), (t.cacheSamples + (if (r.cached >= 0) then 1 else 0))), (total: int, r: Row) => (if r.status.Complete? then (total + r.cost) else total), (t: Totals) => t.spend, Totals(0, 0, 0, 0, 0, 0, 0, 0, 0), rows);
  assert totals(rows).spend == completeCost(rows);
}

lemma lawHeldIsUnresolvedCost_ensures(rows: seq<Row>)
  ensures (lawHeldIsUnresolvedCost(rows) == true)
{
  foldFieldIsCostFold((t: Totals, r: Row) => Totals((t.requests + 1), (t.complete + (if r.status.Complete? then 1 else 0)), (t.failed + (if r.status.Failed? then 1 else 0)), (t.input + r.input), (t.output + r.output), (t.spend + (if r.status.Complete? then r.cost else 0)), (t.held + (if (r.status.Pending? || r.status.Unreported?) then r.cost else 0)), (t.cached + (if (r.cached >= 0) then r.cached else 0)), (t.cacheSamples + (if (r.cached >= 0) then 1 else 0))), (total: int, r: Row) => (if (r.status.Pending? || r.status.Unreported?) then (total + r.cost) else total), (t: Totals) => t.held, Totals(0, 0, 0, 0, 0, 0, 0, 0, 0), rows);
  assert totals(rows).held == heldCost(rows);
}

lemma lawRequestsCountRows_ensures(rows: seq<Row>)
  ensures (lawRequestsCountRows(rows) == true)
{
  foldFieldIsCostFold((t: Totals, r: Row) => Totals((t.requests + 1), (t.complete + (if r.status.Complete? then 1 else 0)), (t.failed + (if r.status.Failed? then 1 else 0)), (t.input + r.input), (t.output + r.output), (t.spend + (if r.status.Complete? then r.cost else 0)), (t.held + (if (r.status.Pending? || r.status.Unreported?) then r.cost else 0)), (t.cached + (if (r.cached >= 0) then r.cached else 0)), (t.cacheSamples + (if (r.cached >= 0) then 1 else 0))), (a: int, r: Row) => (a + 1), (t: Totals) => t.requests, Totals(0, 0, 0, 0, 0, 0, 0, 0, 0), rows);
  foldCountIsLen((a: int, r: Row) => (a + 1), 0, rows);
  assert totals(rows).requests == |rows|;
}
