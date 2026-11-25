// spec/app/console/batch.md, "Story: Prepare and run a batch": proofs for the
// batch machine's rules.

// spec/app/console/batch.md, "Domain / A batch is idle, or a working job of named rows":
// the rules read with the heap-free filter.
lemma RowsUniqueP(b: Batch)
  ensures alwaysRowIdsUnique(b) == !((exists r :: r in rows(b) && !((|ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), rows(b))| == 1))))
{
}

lemma SendingP(b: Batch)
  ensures sending(b) == |ProofLib.Filter((r: BatchRow) => (r.status.Sending?), rows(b))|
{
}

lemma SettledP(before: Batch, via: string, after: Batch)
  ensures stepSettledStaysSettled(before, via, after) == ((via == "clear") || !((exists r :: r in rows(before) && !(((((!r.status.Succeeded?) && (!r.status.Failed?)) && (!r.status.Review?)) || (|ProofLib.Filter((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), rows(after))| == 1))))))
{
}

// spec/app/console/batch.md, "Domain / A batch is idle, or a working job of named rows":
// the fold in setStatusAt rebuilds the whole list, changing only position index.
lemma SetStatusFoldAll(out: seq<BatchRow>, i: int, rest: seq<BatchRow>, index: int, status: RowStatus, detail: string)
  ensures |Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out, i), rest).out| == |out| + |rest|
  ensures forall k :: 0 <= k < |out| && k < |Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out, i), rest).out| ==> Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out, i), rest).out[k] == out[k]
  ensures forall k :: 0 <= k < |rest| && (|out| + k) < |Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out, i), rest).out| ==> Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out, i), rest).out[|out| + k] == (if (i + k) == index then rest[k].(status := status, detail := detail) else rest[k])
  decreases |rest|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |rest| > 0 {
    var first := if i == index then rest[0].(status := status, detail := detail) else rest[0];
    SetStatusFoldAll(out + [first], i + 1, rest[1..], index, status, detail);
    var res := Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out, i), rest).out;
    var resInner := Std.Collections.Seq.FoldLeft((acc: RowAcc, r: BatchRow) => (if (acc.i == index) then RowAcc((acc.out + [r.(status := status, detail := detail)]), (acc.i + 1)) else RowAcc((acc.out + [r]), (acc.i + 1))), RowAcc(out + [first], i + 1), rest[1..]).out;
    assert res == resInner;
    assert forall k :: 0 <= k < |out| ==> (out + [first])[k] == out[k];
    assert |out| < |out + [first]| && |out| < |resInner|;
    assert resInner[|out|] == (out + [first])[|out|];
    assert (out + [first])[|out|] == first;
    assert forall k :: 0 <= k < |rest[1..]| ==> rest[1..][k] == rest[k + 1];
    assert forall k :: 0 <= k < |rest| ==> resInner[|out| + k] == (if (i + k) == index then rest[k].(status := status, detail := detail) else rest[k]);
  }
}

lemma SetStatusAll(rs: seq<BatchRow>, index: int, status: RowStatus, detail: string)
  ensures |setStatusAt(rs, index, status, detail)| == |rs|
  ensures forall j :: 0 <= j < |rs| ==> setStatusAt(rs, index, status, detail)[j] == (if j == index then rs[j].(status := status, detail := detail) else rs[j])
{
  SetStatusFoldAll([], 0, rs, index, status, detail);
  forall j | 0 <= j < |rs|
    ensures setStatusAt(rs, index, status, detail)[j] == (if j == index then rs[j].(status := status, detail := detail) else rs[j])
  {
    assert 0 + j == j;
  }
}

// spec/app/console/batch.md, "Story: Prepare and run a batch": a status change
// keeps every custom id, so the count for any id is unchanged.
lemma IdsPointwise(rs: seq<BatchRow>, res: seq<BatchRow>, c: string)
  requires |rs| == |res|
  requires forall j :: 0 <= j < |rs| ==> res[j].customId == rs[j].customId
  ensures |ProofLib.Filter((x: BatchRow) => (x.customId == c), res)| == |ProofLib.Filter((x: BatchRow) => (x.customId == c), rs)|
{
  ProofLib.FilterLengthPointwise((x: BatchRow) => (x.customId == c), (x: BatchRow) => (x.customId == c), rs, res);
}

// spec/app/console/batch.md, "Story: Prepare and run a batch": a single position
// decides the change in a filter's length.
lemma FilterChangeAt(p: BatchRow -> bool, xs: seq<BatchRow>, ys: seq<BatchRow>, index: int)
  requires |xs| == |ys| && 0 <= index < |xs|
  requires forall j :: 0 <= j < |xs| && j != index ==> p(xs[j]) == p(ys[j])
  ensures |ProofLib.Filter(p, ys)| == |ProofLib.Filter(p, xs)| + (if p(ys[index]) then 1 else 0) - (if p(xs[index]) then 1 else 0)
  decreases |xs|
{
  if index == 0 {
    ProofLib.FilterCons(p, xs);
    ProofLib.FilterCons(p, ys);
    assert forall j :: 0 <= j < |xs[1..]| ==> xs[1..][j] == xs[j + 1] && ys[1..][j] == ys[j + 1];
    assert forall j :: 0 <= j < |xs[1..]| ==> p(xs[1..][j]) == p(ys[1..][j]);
    ProofLib.FilterLengthPointwise(p, p, xs[1..], ys[1..]);
  } else {
    ProofLib.FilterCons(p, xs);
    ProofLib.FilterCons(p, ys);
    assert forall j :: 0 <= j < |xs[1..]| ==> xs[1..][j] == xs[j + 1] && ys[1..][j] == ys[j + 1];
    FilterChangeAt(p, xs[1..], ys[1..], index - 1);
  }
}

// spec/app/console/batch.md, "Story: Prepare and run a batch / A row in flight
// settles one way": the shared body of every settle transition.
lemma SettleAll(b: Batch, index: int, status: RowStatus, detail: string)
  requires inv(b) && settleable(b, index) && !(status.Sending?)
  ensures alwaysRowIdsUnique(settleTo(index, status, detail, b))
  ensures alwaysAtMostOneSending(settleTo(index, status, detail, b))
  ensures stepSettledStaysSettled(b, "x", settleTo(index, status, detail, b))
{
  var res := setStatusAt(b.rows, index, status, detail);
  var after := settleTo(index, status, detail, b);
  SetStatusAll(b.rows, index, status, detail);
  assert after.rows == res;
  assert forall j :: 0 <= j < |b.rows| ==> res[j].customId == b.rows[j].customId;

  RowsUniqueP(b);
  forall r | r in res
    ensures |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), res)| == 1
  {
    var i :| 0 <= i < |res| && res[i] == r;
    assert res[i].customId == b.rows[i].customId;
    assert b.rows[i] in b.rows;
    IdsPointwise(b.rows, res, r.customId);
  }
  assert !(exists r :: r in res && !(|ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), res)| == 1));

  SendingP(b);
  SendingP(after);
  FilterChangeAt((r: BatchRow) => (r.status.Sending?), b.rows, res, index);
  assert rowAt(b, index).status.Sending?;
  assert res[index].status == status;

  SettledP(b, "x", after);
  forall r | r in b.rows && ((r.status.Succeeded? || r.status.Failed?) || r.status.Review?)
    ensures |ProofLib.Filter((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), res)| == 1
  {
    var i :| 0 <= i < |b.rows| && b.rows[i] == r;
    assert i != index by {
      assert rowAt(b, index).status.Sending?;
      assert b.rows[index].status.Sending?;
    }
    assert res[i] == r;
    forall j | 0 <= j < |res| && j != i
      ensures !((res[j].customId == r.customId) && (res[j].status == r.status))
    {
      if res[j].customId == r.customId {
        assert res[j].customId == b.rows[j].customId;
        assert b.rows[j].customId == r.customId;
        assert b.rows[j] in b.rows;
        assert |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), b.rows)| == 1 by {
          assert b.rows[i] in b.rows;
          assert b.rows[i].customId == r.customId;
        }
        ProofLib.FilterTwo((x: BatchRow) => (x.customId == r.customId), b.rows, i, j);
      }
    }
    ProofLib.FilterOne((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), res, i);
  }
}

// spec/app/console/batch.md, "Story: Prepare and run a batch / Running sends one
// queued or blocked row at a time"
lemma StartAll(b: Batch, index: int)
  requires inv(b) && canStart(b, index)
  ensures alwaysRowIdsUnique(start(b, index))
  ensures alwaysAtMostOneSending(start(b, index))
  ensures stepSettledStaysSettled(b, "start", start(b, index))
{
  var res := setStatusAt(b.rows, index, RowStatus.Sending, "");
  var after := start(b, index);
  SetStatusAll(b.rows, index, RowStatus.Sending, "");
  assert after.rows == res;
  assert forall j :: 0 <= j < |b.rows| ==> res[j].customId == b.rows[j].customId;

  RowsUniqueP(b);
  forall r | r in res
    ensures |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), res)| == 1
  {
    var i :| 0 <= i < |res| && res[i] == r;
    assert res[i].customId == b.rows[i].customId;
    assert b.rows[i] in b.rows;
    IdsPointwise(b.rows, res, r.customId);
  }
  assert !(exists r :: r in res && !(|ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), res)| == 1));

  SendingP(b);
  SendingP(after);
  FilterChangeAt((r: BatchRow) => (r.status.Sending?), b.rows, res, index);
  assert res[index].status.Sending?;

  SettledP(b, "start", after);
  forall r | r in b.rows && ((r.status.Succeeded? || r.status.Failed?) || r.status.Review?)
    ensures |ProofLib.Filter((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), res)| == 1
  {
    var i :| 0 <= i < |b.rows| && b.rows[i] == r;
    assert i != index by {
      assert rowAt(b, index).status.Queued? || rowAt(b, index).status.Blocked?;
      assert b.rows[index].status.Queued? || b.rows[index].status.Blocked?;
    }
    assert res[i] == r;
    forall j | 0 <= j < |res| && j != i
      ensures !((res[j].customId == r.customId) && (res[j].status == r.status))
    {
      if res[j].customId == r.customId {
        assert res[j].customId == b.rows[j].customId;
        assert b.rows[j].customId == r.customId;
        assert b.rows[j] in b.rows;
        assert |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), b.rows)| == 1 by {
          assert b.rows[i] in b.rows;
          assert b.rows[i].customId == r.customId;
        }
        ProofLib.FilterTwo((x: BatchRow) => (x.customId == r.customId), b.rows, i, j);
      }
    }
    ProofLib.FilterOne((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), res, i);
  }
}

// spec/app/console/batch.md, "Story: Prepare and run a batch / An interrupted row
// can go back in the queue"
lemma RetryAll(b: Batch, index: int)
  requires inv(b) && canRetry(b, index)
  ensures alwaysRowIdsUnique(retry(b, index))
  ensures alwaysAtMostOneSending(retry(b, index))
  ensures stepSettledStaysSettled(b, "retry", retry(b, index))
{
  var res := setStatusAt(b.rows, index, RowStatus.Queued, "");
  var after := retry(b, index);
  SetStatusAll(b.rows, index, RowStatus.Queued, "");
  assert after.rows == res;
  assert forall j :: 0 <= j < |b.rows| ==> res[j].customId == b.rows[j].customId;

  RowsUniqueP(b);
  forall r | r in res
    ensures |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), res)| == 1
  {
    var i :| 0 <= i < |res| && res[i] == r;
    assert res[i].customId == b.rows[i].customId;
    assert b.rows[i] in b.rows;
    IdsPointwise(b.rows, res, r.customId);
  }
  assert !(exists r :: r in res && !(|ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), res)| == 1));

  SendingP(b);
  SendingP(after);
  FilterChangeAt((r: BatchRow) => (r.status.Sending?), b.rows, res, index);
  assert b.rows[index].status.Interrupted?;
  assert !b.rows[index].status.Sending? && !res[index].status.Sending?;

  SettledP(b, "retry", after);
  forall r | r in b.rows && ((r.status.Succeeded? || r.status.Failed?) || r.status.Review?)
    ensures |ProofLib.Filter((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), res)| == 1
  {
    var i :| 0 <= i < |b.rows| && b.rows[i] == r;
    assert i != index by {
      assert rowAt(b, index).status.Interrupted?;
      assert b.rows[index].status.Interrupted?;
    }
    assert res[i] == r;
    forall j | 0 <= j < |res| && j != i
      ensures !((res[j].customId == r.customId) && (res[j].status == r.status))
    {
      if res[j].customId == r.customId {
        assert res[j].customId == b.rows[j].customId;
        assert b.rows[j].customId == r.customId;
        assert b.rows[j] in b.rows;
        assert |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), b.rows)| == 1 by {
          assert b.rows[i] in b.rows;
          assert b.rows[i].customId == r.customId;
        }
        ProofLib.FilterTwo((x: BatchRow) => (x.customId == r.customId), b.rows, i, j);
      }
    }
    ProofLib.FilterOne((x: BatchRow) => ((x.customId == r.customId) && (x.status == r.status)), res, i);
  }
}

lemma submit_ensures(b: Batch, id: string, filename: string, requests: seq<BatchRequest>)
  ensures (inv(b) ==> canSubmit(b, id, filename, requests) ==> alwaysRowIdsUnique(submit(b, id, filename, requests)))
  ensures (inv(b) ==> canSubmit(b, id, filename, requests) ==> alwaysAtMostOneSending(submit(b, id, filename, requests)))
  ensures (inv(b) ==> canSubmit(b, id, filename, requests) ==> stepSettledStaysSettled(b, "submit", submit(b, id, filename, requests)))
{
  if inv(b) && canSubmit(b, id, filename, requests) {
    var after := submit(b, id, filename, requests);
    var rs := after.rows;
    assert |rs| == |requests|;
    assert forall j :: 0 <= j < |rs| ==> rs[j] == BatchRow(requests[j].customId, requests[j].model, RowStatus.Queued, "");

    RowsUniqueP(after);
    forall r | r in rs
      ensures |ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), rs)| == 1
    {
      var i :| 0 <= i < |rs| && rs[i] == r;
      assert r.customId == requests[i].customId;
      assert requests[i] in requests;
      ProofLib.FilterLengthPointwise((x: BatchRow) => (x.customId == r.customId), (x: BatchRequest) => (x.customId == r.customId), rs, requests);
      assert |ProofLib.Filter((x: BatchRequest) => (x.customId == r.customId), requests)| == 1;
    }
    assert !(exists r :: r in rs && !(|ProofLib.Filter((x: BatchRow) => (x.customId == r.customId), rs)| == 1));

    SendingP(after);
    ProofLib.FilterNone((r: BatchRow) => (r.status.Sending?), rs);
  }
}

lemma start_ensures(b: Batch, index: int)
  ensures (inv(b) ==> canStart(b, index) ==> alwaysRowIdsUnique(start(b, index)))
  ensures (inv(b) ==> canStart(b, index) ==> alwaysAtMostOneSending(start(b, index)))
  ensures (inv(b) ==> canStart(b, index) ==> stepSettledStaysSettled(b, "start", start(b, index)))
{
  if inv(b) && canStart(b, index) {
    StartAll(b, index);
    assert "start" != "clear";
  }
}

lemma succeed_ensures(b: Batch, index: int)
  ensures (inv(b) ==> canSucceed(b, index) ==> alwaysRowIdsUnique(succeed(b, index)))
  ensures (inv(b) ==> canSucceed(b, index) ==> alwaysAtMostOneSending(succeed(b, index)))
  ensures (inv(b) ==> canSucceed(b, index) ==> stepSettledStaysSettled(b, "succeed", succeed(b, index)))
{
  if inv(b) && canSucceed(b, index) {
    SettleAll(b, index, RowStatus.Succeeded, "");
    assert "succeed" != "clear";
  }
}

lemma failed_ensures(b: Batch, index: int, detail: string)
  ensures (inv(b) ==> canFailed(b, index) ==> alwaysRowIdsUnique(failed(b, index, detail)))
  ensures (inv(b) ==> canFailed(b, index) ==> alwaysAtMostOneSending(failed(b, index, detail)))
  ensures (inv(b) ==> canFailed(b, index) ==> stepSettledStaysSettled(b, "failed", failed(b, index, detail)))
{
  if inv(b) && canFailed(b, index) {
    SettleAll(b, index, RowStatus.Failed, detail);
    assert "failed" != "clear";
  }
}

lemma block_ensures(b: Batch, index: int, detail: string)
  ensures (inv(b) ==> canBlock(b, index) ==> alwaysRowIdsUnique(block(b, index, detail)))
  ensures (inv(b) ==> canBlock(b, index) ==> alwaysAtMostOneSending(block(b, index, detail)))
  ensures (inv(b) ==> canBlock(b, index) ==> stepSettledStaysSettled(b, "block", block(b, index, detail)))
{
  if inv(b) && canBlock(b, index) {
    SettleAll(b, index, RowStatus.Blocked, detail);
    assert "block" != "clear";
  }
}

lemma interrupt_ensures(b: Batch, index: int, detail: string)
  ensures (inv(b) ==> canInterrupt(b, index) ==> alwaysRowIdsUnique(interrupt(b, index, detail)))
  ensures (inv(b) ==> canInterrupt(b, index) ==> alwaysAtMostOneSending(interrupt(b, index, detail)))
  ensures (inv(b) ==> canInterrupt(b, index) ==> stepSettledStaysSettled(b, "interrupt", interrupt(b, index, detail)))
{
  if inv(b) && canInterrupt(b, index) {
    SettleAll(b, index, RowStatus.Interrupted, detail);
    assert "interrupt" != "clear";
  }
}

lemma review_ensures(b: Batch, index: int, detail: string)
  ensures (inv(b) ==> canReview(b, index) ==> alwaysRowIdsUnique(review(b, index, detail)))
  ensures (inv(b) ==> canReview(b, index) ==> alwaysAtMostOneSending(review(b, index, detail)))
  ensures (inv(b) ==> canReview(b, index) ==> stepSettledStaysSettled(b, "review", review(b, index, detail)))
{
  if inv(b) && canReview(b, index) {
    SettleAll(b, index, RowStatus.Review, detail);
    assert "review" != "clear";
  }
}

lemma retry_ensures(b: Batch, index: int)
  ensures (inv(b) ==> canRetry(b, index) ==> alwaysRowIdsUnique(retry(b, index)))
  ensures (inv(b) ==> canRetry(b, index) ==> alwaysAtMostOneSending(retry(b, index)))
  ensures (inv(b) ==> canRetry(b, index) ==> stepSettledStaysSettled(b, "retry", retry(b, index)))
{
  if inv(b) && canRetry(b, index) {
    RetryAll(b, index);
    assert "retry" != "clear";
  }
}

lemma clear_ensures(b: Batch)
  ensures (inv(b) ==> canClear(b) ==> alwaysRowIdsUnique(clear(b)))
  ensures (inv(b) ==> canClear(b) ==> alwaysAtMostOneSending(clear(b)))
  ensures (inv(b) ==> canClear(b) ==> stepSettledStaysSettled(b, "clear", clear(b)))
{
}

// spec/app/console/batch.md, "Story: Prepare and run a batch / Submitting a file
// opens a batch of queued rows"
lemma lawSubmitQueuesEveryRow_ensures(id: string, filename: string, requests: seq<BatchRequest>)
  ensures (lawSubmitQueuesEveryRow(id, filename, requests) == true)
{
  var local_0 := submit(Batch.Idle, id, filename, requests);
  if |requests| > 0 {
    assert local_0.Working?;
    assert |local_0.rows| == |requests|;
    forall r | r in local_0.rows
      ensures r.status.Queued?
    {
      var i :| 0 <= i < |local_0.rows| && local_0.rows[i] == r;
      assert local_0.rows[i].status.Queued?;
    }
    assert !(exists r :: r in local_0.rows && !(r.status.Queued?));
  }
}
