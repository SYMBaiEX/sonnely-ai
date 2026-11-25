// Proofs for spec/app/gateway/batch.md. The deduplicating fold that builds
// a job's rows is proved step by step; the status maps that send, settle and
// interrupt a row keep its row list and its uniqueness.

lemma DedupNonShrink(acc: seq<BatchRow>, ids: seq<string>)
  ensures |Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), acc, ids)| >= |acc|
  decreases |ids|
{
  if |ids| > 0 {
    var next := (if (exists r :: r in acc && (r.customId == ids[0])) then acc else (acc + [BatchRow(ids[0], RowStatus.Queued)]));
    assert |next| >= |acc|;
    DedupNonShrink(next, ids[1..]);
  }
}

lemma DedupBounded(acc: seq<BatchRow>, ids: seq<string>)
  ensures |Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), acc, ids)| <= |acc| + |ids|
  decreases |ids|
{
  if |ids| > 0 {
    var next := (if (exists r :: r in acc && (r.customId == ids[0])) then acc else (acc + [BatchRow(ids[0], RowStatus.Queued)]));
    assert |next| <= |acc| + 1;
    DedupBounded(next, ids[1..]);
  }
}

lemma DedupAllQueued(acc: seq<BatchRow>, ids: seq<string>)
  requires forall r :: r in acc ==> r.status.Queued?
  ensures forall r :: r in Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), acc, ids) ==> r.status.Queued?
  decreases |ids|
{
  if |ids| > 0 {
    var next := (if (exists r :: r in acc && (r.customId == ids[0])) then acc else (acc + [BatchRow(ids[0], RowStatus.Queued)]));
    assert forall r :: r in next ==> r.status.Queued? by {
      forall r | r in next
        ensures r.status.Queued?
      {
        if !(r in acc) {
          assert next == acc + [BatchRow(ids[0], RowStatus.Queued)];
          assert r == BatchRow(ids[0], RowStatus.Queued);
        }
      }
    }
    DedupAllQueued(next, ids[1..]);
  }
}

lemma DedupUnique(acc: seq<BatchRow>, ids: seq<string>)
  requires forall x :: x in acc ==> forall y :: y in acc ==> x.customId != y.customId || x.status == y.status
  ensures forall x :: x in Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), acc, ids) ==> forall y :: y in Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), acc, ids) ==> x.customId != y.customId || x.status == y.status
  decreases |ids|
{
  if |ids| > 0 {
    var next := (if (exists r :: r in acc && (r.customId == ids[0])) then acc else (acc + [BatchRow(ids[0], RowStatus.Queued)]));
    assert forall x :: x in next ==> forall y :: y in next ==> x.customId != y.customId || x.status == y.status by {
      forall x | x in next
        ensures forall y :: y in next ==> x.customId != y.customId || x.status == y.status
      {
        forall y | y in next
          ensures x.customId != y.customId || x.status == y.status
        {
          if !(x in acc && y in acc) {
            if (exists r :: r in acc && (r.customId == ids[0])) {
              assert next == acc;
              assert x in acc;
              assert y in acc;
              assert false;
            } else {
              assert next == acc + [BatchRow(ids[0], RowStatus.Queued)];
              if x in acc {
                assert y == BatchRow(ids[0], RowStatus.Queued);
                assert x.customId != y.customId;
              } else if y in acc {
                assert x == BatchRow(ids[0], RowStatus.Queued);
                assert x.customId != y.customId;
              } else {
                assert x == y;
                assert x.status == y.status;
              }
            }
          }
        }
      }
    }
    DedupUnique(next, ids[1..]);
  }
}

lemma DedupNonempty(acc: seq<BatchRow>, ids: seq<string>)
  requires forall r :: r in acc ==> r.customId != ""
  requires forall c :: c in ids ==> c != ""
  ensures forall r :: r in Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), acc, ids) ==> r.customId != ""
  decreases |ids|
{
  if |ids| > 0 {
    assert ids[0] in ids;
    assert ids[0] != "";
    var next := (if (exists r :: r in acc && (r.customId == ids[0])) then acc else (acc + [BatchRow(ids[0], RowStatus.Queued)]));
    assert forall r :: r in next ==> r.customId != "" by {
      forall r | r in next
        ensures r.customId != ""
      {
        if !(r in acc) {
          assert next == acc + [BatchRow(ids[0], RowStatus.Queued)];
          assert r == BatchRow(ids[0], RowStatus.Queued);
        }
      }
    }
    assert forall c :: c in ids[1..] ==> c != "" by {
      forall c | c in ids[1..]
        ensures c != ""
      {
        var i :| 0 <= i < |ids[1..]| && ids[1..][i] == c;
        assert ids[i + 1] == c;
        assert ids[i + 1] in ids;
      }
    }
    DedupNonempty(next, ids[1..]);
  }
}

lemma StatusMapUnique(rs: seq<BatchRow>, customId: string, s: RowStatus, m: seq<BatchRow>)
  requires m == seq(|rs|, i_map requires 0 <= i_map < |rs| => var r := rs[i_map]; (if (r.customId == customId) then r.(status := s) else r))
  requires forall x :: x in rs ==> forall y :: y in rs ==> x.customId != y.customId || x.status == y.status
  ensures forall x :: x in m ==> forall y :: y in m ==> x.customId != y.customId || x.status == y.status
{
  forall x | x in m
    ensures forall y :: y in m ==> x.customId != y.customId || x.status == y.status
  {
    var i :| 0 <= i < |m| && m[i] == x;
    forall y | y in m
      ensures x.customId != y.customId || x.status == y.status
    {
      var j :| 0 <= j < |m| && m[j] == y;
      if x.customId == y.customId {
        assert m[i].customId == rs[i].customId;
        assert m[j].customId == rs[j].customId;
        assert rs[i].customId == rs[j].customId;
        assert rs[i] in rs;
        assert rs[j] in rs;
        assert rs[i].status == rs[j].status;
        if rs[i].customId == customId {
          assert rs[j].customId == customId;
          assert m[i].status == s;
          assert m[j].status == s;
        } else {
          assert rs[j].customId != customId;
          assert m[i].status == rs[i].status;
          assert m[j].status == rs[j].status;
        }
        assert x.status == y.status;
      }
    }
  }
}

lemma StableRows(rs: seq<BatchRow>, m: seq<BatchRow>)
  requires |m| == |rs|
  requires forall i :: 0 <= i < |rs| ==> m[i].customId == rs[i].customId
  ensures forall x :: x in rs ==> exists y :: y in m && y.customId == x.customId
{
  forall x | x in rs
    ensures exists y :: y in m && y.customId == x.customId
  {
    var i :| 0 <= i < |rs| && rs[i] == x;
    assert m[i] in m;
    assert m[i].customId == x.customId;
  }
}

lemma create_ensures(b: Batch, id: string, filename: string, customIds: seq<string>, createdAt: int)
  ensures (inv(b) ==> canCreate(b, id, customIds) ==> alwaysBoundedRows(create(b, id, filename, customIds, createdAt)))
  ensures (inv(b) ==> canCreate(b, id, customIds) ==> alwaysNonemptyIds(create(b, id, filename, customIds, createdAt)))
  ensures (inv(b) ==> canCreate(b, id, customIds) ==> alwaysUniqueCustomIds(create(b, id, filename, customIds, createdAt)))
  ensures (inv(b) ==> canCreate(b, id, customIds) ==> alwaysSingleFlight(create(b, id, filename, customIds, createdAt)))
  ensures (inv(b) ==> canCreate(b, id, customIds) ==> stepTerminalRowsStay(b, create(b, id, filename, customIds, createdAt)))
  ensures (inv(b) ==> canCreate(b, id, customIds) ==> stepRowsAreStable(b, create(b, id, filename, customIds, createdAt)))
{
  if inv(b) && canCreate(b, id, customIds) {
    var rs := Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), [], customIds);
    assert create(b, id, filename, customIds, createdAt).job.rows == rs;
    assert customIds == [customIds[0]] + customIds[1..];
    var empty: seq<BatchRow> := [];
    var first := (if (exists r :: r in empty && (r.customId == customIds[0])) then empty else (empty + [BatchRow(customIds[0], RowStatus.Queued)]));
    assert first == [BatchRow(customIds[0], RowStatus.Queued)];
    assert rs == Std.Collections.Seq.FoldLeft((a: seq<BatchRow>, c: string) => (if (exists r :: r in a && (r.customId == c)) then a else (a + [BatchRow(c, RowStatus.Queued)])), first, customIds[1..]);
    DedupNonShrink([BatchRow(customIds[0], RowStatus.Queued)], customIds[1..]);
    DedupBounded([], customIds);
    DedupUnique([], customIds);
    DedupAllQueued([], customIds);
    DedupNonempty([], customIds);
  }
}

lemma begin_ensures(b: Batch, customId: string, at: int)
  ensures (inv(b) ==> canBegin(b, customId, at) ==> alwaysBoundedRows(begin(b, customId, at)))
  ensures (inv(b) ==> canBegin(b, customId, at) ==> alwaysNonemptyIds(begin(b, customId, at)))
  ensures (inv(b) ==> canBegin(b, customId, at) ==> alwaysUniqueCustomIds(begin(b, customId, at)))
  ensures (inv(b) ==> canBegin(b, customId, at) ==> alwaysSingleFlight(begin(b, customId, at)))
  ensures (inv(b) ==> canBegin(b, customId, at) ==> stepTerminalRowsStay(b, begin(b, customId, at)))
  ensures (inv(b) ==> canBegin(b, customId, at) ==> stepRowsAreStable(b, begin(b, customId, at)))
{
  if inv(b) && canBegin(b, customId, at) && b.Running? {
    var ms := seq(|b.job.rows|, i_map requires 0 <= i_map < |b.job.rows| => var r := b.job.rows[i_map]; (if (r.customId == customId) then r.(status := RowStatus.Sending) else r));
    var after := begin(b, customId, at);
    assert after.job.rows == ms;
    assert after.job.inFlight == customId;
    StatusMapUnique(b.job.rows, customId, RowStatus.Sending, ms);
    assert |ms| == |b.job.rows|;
    assert forall i :: 0 <= i < |b.job.rows| ==> ms[i].customId == b.job.rows[i].customId;
    StableRows(b.job.rows, ms);
    assert customId != "" by {
      var r :| (r in b.job.rows) && (r.customId == customId) && (r.status.Queued? || r.status.Interrupted?);
      assert r.customId != "";
    }
    forall x | x in ms
      ensures x.status.Sending? == (after.job.inFlight != "" && x.customId == after.job.inFlight)
    {
      var i :| 0 <= i < |ms| && ms[i] == x;
      assert x.customId == b.job.rows[i].customId;
    }
  }
}

lemma resolve_ensures(b: Batch, customId: string, verdict: RowStatus)
  ensures (inv(b) ==> canResolve(b, customId, verdict) ==> alwaysBoundedRows(resolve(b, customId, verdict)))
  ensures (inv(b) ==> canResolve(b, customId, verdict) ==> alwaysNonemptyIds(resolve(b, customId, verdict)))
  ensures (inv(b) ==> canResolve(b, customId, verdict) ==> alwaysUniqueCustomIds(resolve(b, customId, verdict)))
  ensures (inv(b) ==> canResolve(b, customId, verdict) ==> alwaysSingleFlight(resolve(b, customId, verdict)))
  ensures (inv(b) ==> canResolve(b, customId, verdict) ==> stepTerminalRowsStay(b, resolve(b, customId, verdict)))
  ensures (inv(b) ==> canResolve(b, customId, verdict) ==> stepRowsAreStable(b, resolve(b, customId, verdict)))
{
  if inv(b) && canResolve(b, customId, verdict) && b.Running? {
    var ms := seq(|b.job.rows|, i_map requires 0 <= i_map < |b.job.rows| => var r := b.job.rows[i_map]; (if (r.customId == customId) then r.(status := verdict) else r));
    assert resolve(b, customId, verdict).job.rows == ms;
    StatusMapUnique(b.job.rows, customId, verdict, ms);
    assert |ms| == |b.job.rows|;
    assert forall i :: 0 <= i < |b.job.rows| ==> ms[i].customId == b.job.rows[i].customId;
    StableRows(b.job.rows, ms);
    forall x | x in ms
      ensures !x.status.Sending?
    {
      var i :| 0 <= i < |ms| && ms[i] == x;
      if b.job.rows[i].customId != customId {
        assert !b.job.rows[i].status.Sending?;
      }
    }
  }
}

lemma interrupt_ensures(b: Batch, customId: string)
  ensures (inv(b) ==> canInterrupt(b, customId) ==> alwaysBoundedRows(interrupt(b, customId)))
  ensures (inv(b) ==> canInterrupt(b, customId) ==> alwaysNonemptyIds(interrupt(b, customId)))
  ensures (inv(b) ==> canInterrupt(b, customId) ==> alwaysUniqueCustomIds(interrupt(b, customId)))
  ensures (inv(b) ==> canInterrupt(b, customId) ==> alwaysSingleFlight(interrupt(b, customId)))
  ensures (inv(b) ==> canInterrupt(b, customId) ==> stepTerminalRowsStay(b, interrupt(b, customId)))
  ensures (inv(b) ==> canInterrupt(b, customId) ==> stepRowsAreStable(b, interrupt(b, customId)))
{
  if inv(b) && canInterrupt(b, customId) && b.Running? {
    var ms := seq(|b.job.rows|, i_map requires 0 <= i_map < |b.job.rows| => var r := b.job.rows[i_map]; (if (r.customId == customId) then r.(status := RowStatus.Interrupted) else r));
    assert interrupt(b, customId).job.rows == ms;
    StatusMapUnique(b.job.rows, customId, RowStatus.Interrupted, ms);
    assert |ms| == |b.job.rows|;
    assert forall i :: 0 <= i < |b.job.rows| ==> ms[i].customId == b.job.rows[i].customId;
    StableRows(b.job.rows, ms);
    forall x | x in ms
      ensures !x.status.Sending?
    {
      var i :| 0 <= i < |ms| && ms[i] == x;
      if b.job.rows[i].customId != customId {
        assert !b.job.rows[i].status.Sending?;
      }
    }
  }
}
