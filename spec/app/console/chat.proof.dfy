// spec/app/console/chat.md, "Story: Talk to a model": proofs for the chat
// machine's rules.
//
// Std.Collections.Seq.Filter is opaque, so every generated filter appears in
// the proofs as ProofLib.Filter applied to the same literal lambda: the two
// read the same.

lemma UniqueP(c: Chat)
  ensures alwaysThreadIdsUnique(c) == !((exists t :: t in c.threads && !((|ProofLib.Filter((x: Thread) => (x.id == t.id), c.threads)| == 1))))
{
}

lemma ThreadP(c: Chat, id: string)
  ensures thread(c, id) == ProofLib.Filter((t: Thread) => (t.id == id), c.threads)
{
}

lemma ChangedP(before: Chat, via: string, after: Chat)
  ensures stepAtMostOneThreadChanges(before, via, after) == ((via != "reply") || !((exists t :: t in before.threads && (!((exists x :: x in after.threads && ((x.id == t.id) && (x.messages == t.messages)))) && (exists u :: u in before.threads && ((u != t) && !((exists x :: x in after.threads && ((x.id == u.id) && (x.messages == u.messages))))))))))
{
}

// spec/app/console/chat.md, "Domain / A thread keeps its messages in order":
// the fold in replaceThread rebuilds the whole list, swapping in fresh_ at id.
lemma ReplaceFoldAll(out: seq<Thread>, rest: seq<Thread>, id: string, fresh_: Thread)
  ensures |Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out, rest)| == |out| + |rest|
  ensures forall k :: 0 <= k < |out| && k < |Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out, rest)| ==> Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out, rest)[k] == out[k]
  ensures forall k :: 0 <= k < |rest| && (|out| + k) < |Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out, rest)| ==> Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out, rest)[|out| + k] == (if rest[k].id == id then fresh_ else rest[k])
  decreases |rest|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |rest| > 0 {
    var first := if rest[0].id == id then fresh_ else rest[0];
    ReplaceFoldAll(out + [first], rest[1..], id, fresh_);
    var res := Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out, rest);
    var resInner := Std.Collections.Seq.FoldLeft((acc: seq<Thread>, t: Thread) => (acc + [(if (t.id == id) then fresh_ else t)]), out + [first], rest[1..]);
    assert res == resInner;
    assert forall k :: 0 <= k < |out| ==> (out + [first])[k] == out[k];
    assert |out| < |out + [first]| && |out| < |resInner|;
    assert resInner[|out|] == (out + [first])[|out|];
    assert (out + [first])[|out|] == first;
    assert forall k :: 0 <= k < |rest[1..]| ==> rest[1..][k] == rest[k + 1];
    assert forall k :: 0 <= k < |rest| ==> resInner[|out| + k] == (if rest[k].id == id then fresh_ else rest[k]);
  }
}

lemma ReplaceAll(ts: seq<Thread>, id: string, fresh_: Thread)
  ensures |replaceThread(ts, id, fresh_)| == |ts|
  ensures forall j :: 0 <= j < |ts| ==> replaceThread(ts, id, fresh_)[j] == (if ts[j].id == id then fresh_ else ts[j])
{
  ReplaceFoldAll([], ts, id, fresh_);
  forall j | 0 <= j < |ts|
    ensures replaceThread(ts, id, fresh_)[j] == (if ts[j].id == id then fresh_ else ts[j])
  {
    assert 0 + j == j;
  }
}

// spec/app/console/chat.md, "Story: Talk to a model": a replacement that keeps
// the id keeps every id count.
lemma ReplaceIds(ts: seq<Thread>, id: string, fresh_: Thread, c: string)
  requires fresh_.id == id
  ensures |ProofLib.Filter((x: Thread) => (x.id == c), replaceThread(ts, id, fresh_))| == |ProofLib.Filter((x: Thread) => (x.id == c), ts)|
{
  ReplaceAll(ts, id, fresh_);
  var res := replaceThread(ts, id, fresh_);
  assert forall j :: 0 <= j < |ts| ==> res[j].id == ts[j].id;
  ProofLib.FilterLengthPointwise((x: Thread) => (x.id == c), (x: Thread) => (x.id == c), ts, res);
}

lemma UniqueReplace(c: Chat, id: string, fresh_: Thread)
  requires inv(c) && fresh_.id == id
  ensures alwaysThreadIdsUnique(c.(threads := replaceThread(c.threads, id, fresh_)))
{
  var res := replaceThread(c.threads, id, fresh_);
  ReplaceAll(c.threads, id, fresh_);
  UniqueP(c);
  var after := c.(threads := res);
  UniqueP(after);
  forall r | r in res
    ensures |ProofLib.Filter((x: Thread) => (x.id == r.id), res)| == 1
  {
    var i :| 0 <= i < |res| && res[i] == r;
    assert res[i].id == c.threads[i].id;
    assert c.threads[i] in c.threads;
    ReplaceIds(c.threads, id, fresh_, r.id);
  }
  assert !(exists r :: r in res && !(|ProofLib.Filter((x: Thread) => (x.id == r.id), res)| == 1));
}

lemma ActiveReplace(c: Chat, id: string, fresh_: Thread)
  requires inv(c) && fresh_.id == id
  ensures alwaysActiveIsRealOrNone(c.(threads := replaceThread(c.threads, id, fresh_)))
{
  var after := c.(threads := replaceThread(c.threads, id, fresh_));
  if after.active != "" {
    ReplaceAll(c.threads, id, fresh_);
    assert after.active == c.active;
    assert |thread(c, c.active)| == 1;
    ThreadP(c, c.active);
    ThreadP(after, c.active);
    assert forall j :: 0 <= j < |c.threads| ==> after.threads[j].id == c.threads[j].id;
    ProofLib.FilterLengthPointwise((t: Thread) => (t.id == c.active), (t: Thread) => (t.id == c.active), c.threads, after.threads);
  }
}

// spec/app/console/chat.md, "Story: Talk to a model": alternation is pairwise;
// the pairwise reading is the fold's ok flag.
lemma AltFoldAll(a: AltAcc, ys: seq<Message>)
  ensures Std.Collections.Seq.FoldLeft((acc: AltAcc, m: Message) => AltAcc((acc.ok && (m.role != acc.prev.role)), m), a, ys).ok
    == (a.ok && (forall j {:trigger ys[j]} :: 0 <= j < |ys| ==> ys[j].role != (if j == 0 then a.prev else ys[j - 1]).role))
  ensures Std.Collections.Seq.FoldLeft((acc: AltAcc, m: Message) => AltAcc((acc.ok && (m.role != acc.prev.role)), m), a, ys).prev
    == (if |ys| == 0 then a.prev else ys[|ys| - 1])
  decreases |ys|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |ys| > 0 {
    var tail := ys[1..];
    var a2 := AltAcc((a.ok && (ys[0].role != a.prev.role)), ys[0]);
    AltFoldAll(a2, tail);
    assert (forall j :: 0 <= j < |tail| ==> tail[j].role != (if j == 0 then a2.prev else tail[j - 1]).role)
      ==> (forall j :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role) by {
      if (forall j {:trigger tail[j]} :: 0 <= j < |tail| ==> tail[j].role != (if j == 0 then a2.prev else tail[j - 1]).role) {
        forall j | 0 <= j < |ys[1..]|
          ensures ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role
        {
          assert tail[j].role != (if j == 0 then a2.prev else tail[j - 1]).role;
          assert ys[1..][j] == tail[j];
          if j > 0 {
            assert ys[1..][j - 1] == tail[j - 1];
          }
        }
      }
    }
    assert (forall j :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role)
      ==> (forall j :: 0 <= j < |tail| ==> tail[j].role != (if j == 0 then a2.prev else tail[j - 1]).role) by {
      if (forall j {:trigger ys[1..][j]} :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role) {
        forall j | 0 <= j < |tail|
          ensures tail[j].role != (if j == 0 then a2.prev else tail[j - 1]).role
        {
          assert ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role;
          assert tail[j] == ys[1..][j];
          if j > 0 {
            assert tail[j - 1] == ys[1..][j - 1];
          }
        }
      }
    }
    AltSplit(ys, a.prev);
    if |ys[1..]| > 0 {
      assert ys[1..][|ys[1..]| - 1] == ys[|ys| - 1];
    }
  }
}

lemma AltSplit(ys: seq<Message>, prev: Message)
  requires |ys| > 0
  ensures (forall j :: 0 <= j < |ys| ==> ys[j].role != (if j == 0 then prev else ys[j - 1]).role)
    == ((ys[0].role != prev.role) && (forall j :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role))
{
  assert (forall j :: 0 <= j < |ys| ==> ys[j].role != (if j == 0 then prev else ys[j - 1]).role)
    ==> ((ys[0].role != prev.role) && (forall j :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role)) by {
    if (forall j {:trigger ys[j]} :: 0 <= j < |ys| ==> ys[j].role != (if j == 0 then prev else ys[j - 1]).role) {
      assert ys[0].role != prev.role;
      forall j | 0 <= j < |ys[1..]|
        ensures ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role
      {
        assert ys[j + 1].role != (if j + 1 == 0 then prev else ys[j + 1 - 1]).role;
        assert ys[1..][j] == ys[j + 1];
        if j > 0 {
          assert ys[1..][j - 1] == ys[j];
        }
      }
    }
  }
  assert ((ys[0].role != prev.role) && (forall j :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role))
    ==> (forall j :: 0 <= j < |ys| ==> ys[j].role != (if j == 0 then prev else ys[j - 1]).role) by {
    if (ys[0].role != prev.role) && (forall j {:trigger ys[1..][j]} :: 0 <= j < |ys[1..]| ==> ys[1..][j].role != (if j == 0 then ys[0] else ys[1..][j - 1]).role) {
      forall j | 0 <= j < |ys|
        ensures ys[j].role != (if j == 0 then prev else ys[j - 1]).role
      {
        if j == 0 {
        } else {
          assert ys[1..][j - 1].role != (if j - 1 == 0 then ys[0] else ys[1..][j - 1 - 1]).role;
          assert ys[j] == ys[1..][j - 1];
          if j > 1 {
            assert ys[j - 1] == ys[1..][j - 1 - 1];
          }
        }
      }
    }
  }
}

lemma AltHead(xs: seq<Message>)
  ensures alternates(xs) == ((|xs| == 0) || (xs[0].role.User? && (forall j {:trigger xs[1..][j]} :: 0 <= j < |xs[1..]| ==> xs[1..][j].role != (if j == 0 then xs[0] else xs[1..][j - 1]).role)))
{
  if |xs| > 0 {
    var a := AltAcc(xs[0].role.User?, xs[0]);
    AltFoldAll(a, xs[1..]);
    assert a.ok == xs[0].role.User?;
  }
}

// spec/app/console/chat.md, "Story: Talk to a model": alternation at index j.
lemma AltAt(xs: seq<Message>, j: int)
  requires alternates(xs) && 1 <= j < |xs|
  ensures xs[j].role != xs[j - 1].role
{
  AltHead(xs);
  assert xs[1..][j - 1] == xs[j];
  if j > 1 {
    assert xs[1..][j - 2] == xs[j - 1];
  }
}

// spec/app/console/chat.md, "Story: Talk to a model": appending the other role
// keeps a thread alternating.
lemma AltPApp(xs: seq<Message>, prev: Message, m: Message)
  requires forall j {:trigger xs[j]} :: 0 <= j < |xs| ==> xs[j].role != (if j == 0 then prev else xs[j - 1]).role
  requires (|xs| == 0) ==> (m.role != prev.role)
  requires (|xs| > 0) ==> (xs[|xs| - 1].role != m.role)
  ensures forall j {:trigger (xs + [m])[j]} :: 0 <= j < |xs + [m]| ==> (xs + [m])[j].role != (if j == 0 then prev else (xs + [m])[j - 1]).role
{
  forall j | 0 <= j < |xs + [m]|
    ensures (xs + [m])[j].role != (if j == 0 then prev else (xs + [m])[j - 1]).role
  {
    if j < |xs| {
      assert (xs + [m])[j] == xs[j];
      if j > 0 {
        assert (xs + [m])[j - 1] == xs[j - 1];
      }
    } else {
      assert j == |xs|;
      assert (xs + [m])[j] == m;
      if j > 0 {
        assert (xs + [m])[j - 1] == xs[|xs| - 1];
      }
    }
  }
}

lemma AltAppend(xs: seq<Message>, m: Message)
  requires |xs| > 0 && alternates(xs) && xs[|xs| - 1].role != m.role
  ensures alternates(xs + [m])
{
  AltHead(xs);
  AltHead(xs + [m]);
  assert (xs + [m])[0] == xs[0];
  assert xs[0].role.User?;
  assert (xs + [m])[1..] == xs[1..] + [m];
  if |xs[1..]| > 0 {
    assert xs[1..][|xs[1..]| - 1] == xs[|xs| - 1];
    AltPApp(xs[1..], xs[0], m);
  } else {
    assert xs[1..] + [m] == [m];
    assert xs[|xs| - 1] == xs[0];
    assert m.role != xs[0].role;
    AltPApp(xs[1..], xs[0], m);
  }
  forall j | 0 <= j < |(xs + [m])[1..]|
    ensures (xs + [m])[1..][j].role != (if j == 0 then (xs + [m])[0] else (xs + [m])[1..][j - 1]).role
  {
    assert (xs + [m])[1..][j] == (xs[1..] + [m])[j];
    if j > 0 {
      assert (xs + [m])[1..][j - 1] == (xs[1..] + [m])[j - 1];
    }
  }
}

// spec/app/console/chat.md, "Story: Talk to a model": the start of an
// alternating thread still alternates.
lemma AltPPre(xs: seq<Message>, prev: Message, k: int)
  requires (forall j {:trigger xs[j]} :: 0 <= j < |xs| ==> xs[j].role != (if j == 0 then prev else xs[j - 1]).role) && 0 <= k <= |xs|
  ensures forall j {:trigger xs[0..k][j]} :: 0 <= j < |xs[0..k]| ==> xs[0..k][j].role != (if j == 0 then prev else xs[0..k][j - 1]).role
{
  forall j | 0 <= j < |xs[0..k]|
    ensures xs[0..k][j].role != (if j == 0 then prev else xs[0..k][j - 1]).role
  {
    assert xs[0..k][j] == xs[j];
    if j > 0 {
      assert xs[0..k][j - 1] == xs[j - 1];
    }
  }
}

lemma AltPrefix(xs: seq<Message>, k: int)
  requires alternates(xs) && 0 <= k <= |xs|
  ensures alternates(xs[0..k])
{
  AltHead(xs);
  AltHead(xs[0..k]);
  if k > 0 {
    assert xs[0..k][0] == xs[0];
    assert xs[0].role.User?;
    assert xs[0..k][1..] == xs[1..][0..(k - 1)];
    AltPPre(xs[1..], xs[0], k - 1);
    forall j | 0 <= j < |xs[0..k][1..]|
      ensures xs[0..k][1..][j].role != (if j == 0 then xs[0..k][0] else xs[0..k][1..][j - 1]).role
    {
      assert xs[0..k][1..][j] == xs[1..][0..(k - 1)][j];
      if j > 0 {
        assert xs[0..k][1..][j - 1] == xs[1..][0..(k - 1)][j - 1];
      }
    }
  }
}

// spec/app/console/chat.md, "Domain / A thread keeps its messages in order":
// the fold in takeMessages keeps the first n elements.
lemma TakeFoldAll(out: seq<Message>, i: int, rest: seq<Message>, n: int)
  ensures |Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i), rest).out|
    == |out| + (if (n - i) <= 0 then 0 else if (n - i) >= |rest| then |rest| else n - i)
  ensures forall k :: (0 <= k < |out| && k < |Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i), rest).out| ==> Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i), rest).out[k] == out[k])
  ensures forall k :: (0 <= k < (if (n - i) <= 0 then 0 else if (n - i) >= |rest| then |rest| else n - i) && (|out| + k) < |Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i), rest).out| ==> Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i), rest).out[|out| + k] == rest[k])
  decreases |rest|
{
  reveal Std.Collections.Seq.FoldLeft();
  if |rest| > 0 {
    var res := Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i), rest).out;
    if i < n {
      TakeFoldAll(out + [rest[0]], i + 1, rest[1..], n);
      var resInner := Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out + [rest[0]], i + 1), rest[1..]).out;
      assert res == resInner;
      assert forall k :: 0 <= k < |out| ==> (out + [rest[0]])[k] == out[k];
      var kIn := if (n - (i + 1)) <= 0 then 0 else if (n - (i + 1)) >= |rest[1..]| then |rest[1..]| else n - (i + 1);
      var k0 := if (n - i) <= 0 then 0 else if (n - i) >= |rest| then |rest| else n - i;
      assert |resInner| == |out| + 1 + kIn;
      assert k0 == 1 + kIn;
      assert |resInner| > |out|;
      assert resInner[|out|] == (out + [rest[0]])[|out|];
      assert (out + [rest[0]])[|out|] == rest[0];
      assert resInner[|out|] == rest[0];
      forall k | 1 <= k < k0
        ensures resInner[|out| + k] == rest[k]
      {
        assert 0 <= k - 1 < kIn;
        assert (|out| + 1) + (k - 1) < |resInner|;
        assert resInner[(|out| + 1) + (k - 1)] == rest[1..][k - 1];
        assert rest[1..][k - 1] == rest[k];
      }
    } else {
      TakeFoldAll(out, i + 1, rest[1..], n);
      var resInner := Std.Collections.Seq.FoldLeft((acc: TakeAcc, m: Message) => (if (acc.i < n) then TakeAcc((acc.out + [m]), (acc.i + 1)) else TakeAcc(acc.out, (acc.i + 1))), TakeAcc(out, i + 1), rest[1..]).out;
      assert res == resInner;
      assert (n - i) <= 0 && (n - (i + 1)) <= 0;
    }
  }
}

lemma TakeIs(xs: seq<Message>, n: int)
  ensures takeMessages(xs, n) == (if n <= 0 then [] else if n >= |xs| then xs else xs[0..n])
{
  TakeFoldAll([], 0, xs, n);
  var res := takeMessages(xs, n);
  var k := if (n - 0) <= 0 then 0 else if (n - 0) >= |xs| then |xs| else n - 0;
  assert |res| == k;
  forall j | 0 <= j < k
    ensures res[j] == xs[j]
  {
  }
  assert res == xs[0..k];
}

// spec/app/console/chat.md, "Story: Talk to a model": a filter keeps only
// members that pass, and splitting a list splits a filter.
lemma ConsMember<T>(x: T, a: T, rest: seq<T>)
  requires x in [a] + rest
  ensures x == a || x in rest
{
  var i :| 0 <= i < |[a] + rest| && ([a] + rest)[i] == x;
  if i > 0 {
    assert ([a] + rest)[i] == rest[i - 1];
    assert x in rest;
  }
}

lemma FilterConcat<T>(p: T -> bool, a: seq<T>, b: seq<T>)
  ensures ProofLib.Filter(p, a + b) == ProofLib.Filter(p, a) + ProofLib.Filter(p, b)
  decreases |a|
{
  if |a| > 0 {
    ProofLib.FilterCons(p, a + b);
    ProofLib.FilterCons(p, a);
    assert (a + b)[0] == a[0];
    assert (a + b)[1..] == a[1..] + b;
    FilterConcat(p, a[1..], b);
    var head := if p(a[0]) then [a[0]] else [];
    assert ProofLib.Filter(p, a) + ProofLib.Filter(p, b) == head + (ProofLib.Filter(p, a[1..]) + ProofLib.Filter(p, b));
    assert ProofLib.Filter(p, a + b) == head + (ProofLib.Filter(p, a[1..]) + ProofLib.Filter(p, b));
  } else {
    ProofLib.FilterNil(p, a);
    assert a + b == b;
  }
}

lemma FilterSubseq<T>(p: T -> bool, q: T -> bool, xs: seq<T>)
  requires forall x :: q(x) ==> p(x)
  ensures ProofLib.Filter(q, ProofLib.Filter(p, xs)) == ProofLib.Filter(q, xs)
  decreases |xs|
{
  if |xs| > 0 {
    ProofLib.FilterCons(p, xs);
    ProofLib.FilterCons(q, xs);
    if p(xs[0]) {
      var fp := ProofLib.Filter(p, xs[1..]);
      assert ProofLib.Filter(p, xs) == [xs[0]] + fp;
      ProofLib.FilterCons(q, [xs[0]] + fp);
      assert ([xs[0]] + fp)[0] == xs[0];
      assert ([xs[0]] + fp)[1..] == fp;
      FilterSubseq(p, q, xs[1..]);
      assert ProofLib.Filter(q, [xs[0]] + fp) == (if q(xs[0]) then [xs[0]] else []) + ProofLib.Filter(q, fp);
    } else {
      assert !q(xs[0]);
      assert ProofLib.Filter(p, xs) == ProofLib.Filter(p, xs[1..]);
      FilterSubseq(p, q, xs[1..]);
    }
  } else {
    ProofLib.FilterNil(p, xs);
    ProofLib.FilterNil(q, xs);
    ProofLib.FilterNil(q, ProofLib.Filter(p, xs));
  }
}

// spec/app/console/chat.md, "Story: Talk to a model / Sending starts or extends
// a thread": the threads list that send builds, and what holds of it.
lemma SendList(c: Chat, id: string, model: string, text: string)
  requires inv(c) && canSend(c, id, model, text)
  ensures alwaysTurnsAlternate(send(c, id, model, text))
  ensures alwaysActiveIsRealOrNone(send(c, id, model, text))
  ensures alwaysThreadIdsUnique(send(c, id, model, text))
{
  var local_0 := thread(c, id);
  var after := send(c, id, model, text);
  UniqueP(c);
  var after2 := c.(threads := after.threads);
  UniqueP(after2);
  var F := ProofLib.Filter((x: Thread) => (x.id != id), c.threads);
  if |local_0| == 0 {
    var newT := Thread(id, model, [Message(Role.User, text, model)]);
    assert after.threads == [newT] + c.threads && after.active == id;
    AltHead(newT.messages);
    assert newT.messages[0].role.User?;
    assert alternates(newT.messages);
    forall t | t in after.threads
      ensures alternates(t.messages)
    {
      ConsMember(t, newT, c.threads);
      if t in c.threads {
        assert alternates(t.messages);
      }
    }
    assert !(exists t :: t in after.threads && !(alternates(t.messages)));

    ThreadP(after, id);
    FilterConcat((t: Thread) => (t.id == id), [newT], c.threads);
    assert ProofLib.Filter((t: Thread) => (t.id == id), [newT]) == [newT] by {
      ProofLib.FilterCons((t: Thread) => (t.id == id), [newT]);
      ProofLib.FilterNil((t: Thread) => (t.id == id), [newT][1..]);
    }
    ThreadP(c, id);
    assert |ProofLib.Filter((t: Thread) => (t.id == id), c.threads)| == 0;

    forall r | r in after.threads
      ensures |ProofLib.Filter((x: Thread) => (x.id == r.id), after.threads)| == 1
    {
      ConsMember(r, newT, c.threads);
      FilterConcat((x: Thread) => (x.id == r.id), [newT], c.threads);
      if r == newT {
        assert ProofLib.Filter((x: Thread) => (x.id == r.id), [newT]) == [newT] by {
          ProofLib.FilterCons((x: Thread) => (x.id == r.id), [newT]);
          ProofLib.FilterNil((x: Thread) => (x.id == r.id), [newT][1..]);
        }
        assert |ProofLib.Filter((x: Thread) => (x.id == r.id), c.threads)| == 0;
      } else {
        assert r.id != id by {
          if r.id == id {
            assert r in thread(c, id) by {
              ThreadP(c, id);
              ProofLib.FilterMember((t: Thread) => (t.id == id), c.threads, r);
            }
            assert |thread(c, id)| > 0;
          }
        }
        assert newT.id != r.id;
        ProofLib.FilterNone((x: Thread) => (x.id == r.id), [newT]);
        assert r in c.threads;
        assert |ProofLib.Filter((x: Thread) => (x.id == r.id), c.threads)| == 1;
      }
    }
    assert !(exists r :: r in after.threads && !(|ProofLib.Filter((x: Thread) => (x.id == r.id), after.threads)| == 1));
  } else {
    var l2 := (if ((0 <= 0) && (0 < |local_0|)) then local_0[0] else Thread(id, model, []));
    var t0 := local_0[0];
    assert l2 == t0;
    var msgs := (if (((|local_0| > 0) && (|l2.messages| > 0)) && lastMessage(l2).role.User?) then ((if ((0 <= (|l2.messages| - 1)) && ((|l2.messages| - 1) < |l2.messages|)) then (l2.messages[0..(|l2.messages| - 1)] + l2.messages[((|l2.messages| - 1) + 1)..]) else l2.messages) + [Message(Role.User, text, model)]) else (l2.messages + [Message(Role.User, text, model)]));
    var t2 := l2.(model := model, messages := msgs);
    assert after.threads == [t2] + F && after.active == id;
    ThreadP(c, id);
    ProofLib.FilterMember((t: Thread) => (t.id == id), c.threads, t0);
    assert t0 in c.threads && t0.id == id;
    assert alternates(t0.messages);
    assert alternates(t2.messages) by {
      if ((|t0.messages| > 0) && lastMessage(t0).role.User?) {
        var n := |t0.messages|;
        assert n >= 1;
        assert t0.messages[((n - 1) + 1)..] == [];
        var pre := t0.messages[0..(n - 1)];
        assert (t0.messages[0..(n - 1)] + t0.messages[((n - 1) + 1)..]) == pre;
        assert msgs == pre + [Message(Role.User, text, model)];
        AltPrefix(t0.messages, n - 1);
        assert alternates(pre);
        if n == 1 {
          assert pre == [];
          assert msgs == [Message(Role.User, text, model)];
          AltHead([Message(Role.User, text, model)]);
          assert alternates([Message(Role.User, text, model)]);
        } else {
          assert n >= 2 && |pre| == n - 1;
          assert pre[|pre| - 1] == t0.messages[n - 2];
          AltAt(t0.messages, n - 1);
          assert t0.messages[n - 1].role != t0.messages[n - 2].role;
          assert lastMessage(t0) == t0.messages[n - 1];
          assert t0.messages[n - 2].role.Assistant?;
          assert pre[|pre| - 1].role != Role.User;
          AltAppend(pre, Message(Role.User, text, model));
        }
      } else {
        assert msgs == t0.messages + [Message(Role.User, text, model)];
        if |t0.messages| == 0 {
          assert msgs == [Message(Role.User, text, model)];
          AltHead([Message(Role.User, text, model)]);
          assert alternates([Message(Role.User, text, model)]);
        } else {
          assert !lastMessage(t0).role.User?;
          assert lastMessage(t0) == t0.messages[|t0.messages| - 1];
          assert t0.messages[|t0.messages| - 1].role.Assistant?;
          AltAppend(t0.messages, Message(Role.User, text, model));
        }
      }
    }
    forall t | t in after.threads
      ensures alternates(t.messages)
    {
      ConsMember(t, t2, F);
      if t in F {
        assert t in ProofLib.Filter((x: Thread) => (x.id != id), c.threads);
        ProofLib.FilterMember((x: Thread) => (x.id != id), c.threads, t);
        assert alternates(t.messages);
      }
    }
    assert !(exists t :: t in after.threads && !(alternates(t.messages)));

    ThreadP(after, id);
    FilterConcat((t: Thread) => (t.id == id), [t2], F);
    assert ProofLib.Filter((t: Thread) => (t.id == id), [t2]) == [t2] by {
      ProofLib.FilterCons((t: Thread) => (t.id == id), [t2]);
      ProofLib.FilterNil((t: Thread) => (t.id == id), [t2][1..]);
    }
    assert |ProofLib.Filter((t: Thread) => (t.id == id), F)| == 0 by {
      forall i | 0 <= i < |F|
        ensures !(F[i].id == id)
      {
        assert F[i] in F;
        ProofLib.FilterMember((x: Thread) => (x.id != id), c.threads, F[i]);
        assert F[i].id != id;
      }
      ProofLib.FilterNone((t: Thread) => (t.id == id), F);
    }
    assert |ProofLib.Filter((t: Thread) => (t.id == id), after.threads)| == 1;

    forall r | r in after.threads
      ensures |ProofLib.Filter((x: Thread) => (x.id == r.id), after.threads)| == 1
    {
      ConsMember(r, t2, F);
      FilterConcat((x: Thread) => (x.id == r.id), [t2], F);
      if r == t2 {
        assert ProofLib.Filter((x: Thread) => (x.id == r.id), [t2]) == [t2] by {
          ProofLib.FilterCons((x: Thread) => (x.id == r.id), [t2]);
          ProofLib.FilterNil((x: Thread) => (x.id == r.id), [t2][1..]);
        }
        assert r.id == id;
        assert |ProofLib.Filter((x: Thread) => (x.id == r.id), F)| == 0 by {
          forall i | 0 <= i < |F|
            ensures !(F[i].id == r.id)
          {
            assert F[i] in F;
            ProofLib.FilterMember((x: Thread) => (x.id != id), c.threads, F[i]);
            assert F[i].id != id && r.id == id;
          }
          ProofLib.FilterNone((x: Thread) => (x.id == r.id), F);
        }
      } else {
        assert r in F;
        assert r in ProofLib.Filter((x: Thread) => (x.id != id), c.threads);
        ProofLib.FilterMember((x: Thread) => (x.id != id), c.threads, r);
        assert r in c.threads && r.id != id;
        assert t2.id != r.id;
        ProofLib.FilterNone((x: Thread) => (x.id == r.id), [t2]);
        assert |ProofLib.Filter((x: Thread) => (x.id == r.id), c.threads)| == 1;
        assert forall x: Thread :: (x.id == r.id) ==> (x.id != id);
        FilterSubseq((x: Thread) => (x.id != id), (x: Thread) => (x.id == r.id), c.threads);
        assert ProofLib.Filter((x: Thread) => (x.id == r.id), F)
          == ProofLib.Filter((x: Thread) => (x.id == r.id), ProofLib.Filter((x: Thread) => (x.id != id), c.threads));
      }
    }
    assert !(exists r :: r in after.threads && !(|ProofLib.Filter((x: Thread) => (x.id == r.id), after.threads)| == 1));
  }
}

lemma send_ensures(c: Chat, id: string, model: string, text: string)
  ensures (inv(c) ==> canSend(c, id, model, text) ==> alwaysTurnsAlternate(send(c, id, model, text)))
  ensures (inv(c) ==> canSend(c, id, model, text) ==> alwaysActiveIsRealOrNone(send(c, id, model, text)))
  ensures (inv(c) ==> canSend(c, id, model, text) ==> alwaysThreadIdsUnique(send(c, id, model, text)))
  ensures (inv(c) ==> canSend(c, id, model, text) ==> stepAtMostOneThreadChanges(c, "send", send(c, id, model, text)))
{
  if inv(c) && canSend(c, id, model, text) {
    SendList(c, id, model, text);
    assert "send" != "reply";
  }
}

lemma reply_ensures(c: Chat, id: string, model: string, text: string)
  ensures (inv(c) ==> canReply(c, id) ==> alwaysTurnsAlternate(reply(c, id, model, text)))
  ensures (inv(c) ==> canReply(c, id) ==> alwaysActiveIsRealOrNone(reply(c, id, model, text)))
  ensures (inv(c) ==> canReply(c, id) ==> alwaysThreadIdsUnique(reply(c, id, model, text)))
  ensures (inv(c) ==> canReply(c, id) ==> stepAtMostOneThreadChanges(c, "reply", reply(c, id, model, text)))
{
  if inv(c) && canReply(c, id) {
    var local_4 := thread(c, id);
    var l5 := (if ((0 <= 0) && (0 < |local_4|)) then local_4[0] else Thread(id, model, []));
    var t0 := local_4[0];
    assert l5 == t0;
    var last := lastMessage(t0);
    var msgs := (if last.role.Assistant? then ((if ((0 <= (|t0.messages| - 1)) && ((|t0.messages| - 1) < |t0.messages|)) then (t0.messages[0..(|t0.messages| - 1)] + t0.messages[((|t0.messages| - 1) + 1)..]) else t0.messages) + [last.(content := text)]) else (t0.messages + [Message(Role.Assistant, text, model)]));
    var freshT := t0.(messages := msgs);
    var res := replaceThread(c.threads, id, freshT);
    var after := reply(c, id, model, text);
    assert after == c.(threads := res);
    ReplaceAll(c.threads, id, freshT);
    assert freshT.id == t0.id;
    assert forall j :: 0 <= j < |c.threads| ==> res[j].id == c.threads[j].id;

    ThreadP(c, id);
    ProofLib.FilterMember((t: Thread) => (t.id == id), c.threads, t0);
    assert t0 in c.threads && t0.id == id;
    assert freshT.id == id;

    UniqueReplace(c, id, freshT);
    ActiveReplace(c, id, freshT);

    assert alternates(t0.messages);
    assert |t0.messages| > 0;
    AltHead(t0.messages);
    assert t0.messages[0].role.User?;
    if last.role.Assistant? {
      assert last == t0.messages[|t0.messages| - 1];
      assert |t0.messages| >= 2 by {
        if |t0.messages| < 2 {
          assert t0.messages[0] == last;
          assert t0.messages[0].role.Assistant?;
          assert !t0.messages[0].role.User?;
        }
      }
      var pre := t0.messages[0..(|t0.messages| - 1)];
      assert t0.messages[((|t0.messages| - 1) + 1)..] == [];
      assert (t0.messages[0..(|t0.messages| - 1)] + t0.messages[((|t0.messages| - 1) + 1)..]) == pre;
      assert msgs == pre + [last.(content := text)];
      AltPrefix(t0.messages, |t0.messages| - 1);
      assert alternates(pre);
      assert |pre| > 0;
      assert pre[|pre| - 1] == t0.messages[|t0.messages| - 2];
      AltAt(t0.messages, |t0.messages| - 1);
      assert t0.messages[|t0.messages| - 1].role != t0.messages[|t0.messages| - 2].role;
      assert pre[|pre| - 1].role != last.role;
      AltAppend(pre, last.(content := text));
    } else {
      assert !last.role.Assistant?;
      assert last.role.User?;
      assert last == t0.messages[|t0.messages| - 1];
      assert t0.messages[|t0.messages| - 1].role != Role.Assistant;
      AltAppend(t0.messages, Message(Role.Assistant, text, model));
      assert msgs == t0.messages + [Message(Role.Assistant, text, model)];
    }
    assert alternates(msgs);
    assert alternates(freshT.messages);

    forall t | t in res
      ensures alternates(t.messages)
    {
      var j :| 0 <= j < |res| && res[j] == t;
      if c.threads[j].id == id {
        assert t == freshT;
      } else {
        assert t == c.threads[j];
        assert c.threads[j] in c.threads;
      }
    }
    assert !(exists t :: t in res && !(alternates(t.messages)));

    ChangedP(c, "reply", after);
    assert after.threads == res;
    assert |ProofLib.Filter((x: Thread) => (x.id == id), c.threads)| == 1 by {
      ThreadP(c, id);
      assert t0 in c.threads && t0.id == id;
      UniqueP(c);
      assert |ProofLib.Filter((x: Thread) => (x.id == t0.id), c.threads)| == 1;
      ProofLib.FilterSamePredicate((t: Thread) => (t.id == id), (x: Thread) => (x.id == t0.id), c.threads);
    }
    NoTwoChanged(c.threads, after.threads, id);
    assert stepAtMostOneThreadChanges(c, "reply", after);
  }
}

// spec/app/console/chat.md, "A reply touches at most one thread": in a list
// where only the thread with id may differ, no two threads are both absent.
lemma NoTwoChanged(threads: seq<Thread>, res: seq<Thread>, id: string)
  requires |res| == |threads|
  requires forall i :: 0 <= i < |threads| ==> (threads[i].id != id ==> res[i] == threads[i])
  requires |ProofLib.Filter((x: Thread) => (x.id == id), threads)| == 1
  ensures !(exists t :: t in threads && (!((exists x :: x in res && ((x.id == t.id) && (x.messages == t.messages)))) && (exists u :: u in threads && ((u != t) && !((exists x :: x in res && ((x.id == u.id) && (x.messages == u.messages))))))))
{
  forall t | t in threads
    ensures !((!(exists x :: x in res && ((x.id == t.id) && (x.messages == t.messages)))) && (exists u :: u in threads && ((u != t) && (!(exists x :: x in res && ((x.id == u.id) && (x.messages == u.messages)))))))
  {
    if t.id != id {
      var i :| 0 <= i < |threads| && threads[i] == t;
      assert res[i] == t;
      assert res[i] in res;
    } else {
      if (exists u :: u in threads && ((u != t) && (!(exists x :: x in res && ((x.id == u.id) && (x.messages == u.messages)))))) {
        var u :| u in threads && ((u != t) && (!(exists x :: x in res && ((x.id == u.id) && (x.messages == u.messages)))));
        if u.id == id {
          var F := ProofLib.Filter((x: Thread) => (x.id == id), threads);
          assert |F| == 1;
          ProofLib.FilterMember((x: Thread) => (x.id == id), threads, u);
          ProofLib.FilterMember((x: Thread) => (x.id == id), threads, t);
          assert u in F && t in F;
          assert u == F[0] && t == F[0];
          assert u == t;
          assert false;
        } else {
          var i :| 0 <= i < |threads| && threads[i] == u;
          assert res[i] == u;
          assert res[i] in res;
        }
      }
    }
  }
}

lemma open_ensures(c: Chat, id: string)
  ensures (inv(c) ==> canOpen(c, id) ==> alwaysTurnsAlternate(open(c, id)))
  ensures (inv(c) ==> canOpen(c, id) ==> alwaysActiveIsRealOrNone(open(c, id)))
  ensures (inv(c) ==> canOpen(c, id) ==> alwaysThreadIdsUnique(open(c, id)))
  ensures (inv(c) ==> canOpen(c, id) ==> stepAtMostOneThreadChanges(c, "open", open(c, id)))
{
  if inv(c) && canOpen(c, id) {
    var after := open(c, id);
    assert after.threads == c.threads && after.active == id;
    assert |thread(c, id)| == 1 by {
      var t0 := thread(c, id)[0];
      assert t0 in thread(c, id);
      ThreadP(c, id);
      ProofLib.FilterMember((t: Thread) => (t.id == id), c.threads, t0);
      UniqueP(c);
      assert t0 in c.threads && t0.id == id;
      assert |ProofLib.Filter((x: Thread) => (x.id == t0.id), c.threads)| == 1;
      ProofLib.FilterSamePredicate((t: Thread) => (t.id == id), (x: Thread) => (x.id == t0.id), c.threads);
    }
    ThreadP(after, id);
    assert |thread(after, id)| == 1;
  }
}

lemma remove_ensures(c: Chat, id: string)
  ensures (inv(c) ==> canRemove(c, id) ==> alwaysTurnsAlternate(remove(c, id)))
  ensures (inv(c) ==> canRemove(c, id) ==> alwaysActiveIsRealOrNone(remove(c, id)))
  ensures (inv(c) ==> canRemove(c, id) ==> alwaysThreadIdsUnique(remove(c, id)))
  ensures (inv(c) ==> canRemove(c, id) ==> stepAtMostOneThreadChanges(c, "remove", remove(c, id)))
{
  if inv(c) && canRemove(c, id) {
    var after := remove(c, id);
    var F := ProofLib.Filter((x: Thread) => (x.id != id), c.threads);
    assert after.threads == F;
    forall t | t in F
      ensures alternates(t.messages)
    {
      ProofLib.FilterMember((x: Thread) => (x.id != id), c.threads, t);
      assert t in c.threads;
      assert alternates(t.messages);
    }
    assert !(exists t :: t in after.threads && !(alternates(t.messages)));

    UniqueP(c);
    var after2 := c.(threads := after.threads);
    UniqueP(after2);
    forall r | r in after.threads
      ensures |ProofLib.Filter((x: Thread) => (x.id == r.id), after.threads)| == 1
    {
      ProofLib.FilterMember((x: Thread) => (x.id != id), c.threads, r);
      assert r in c.threads && r.id != id;
      assert |ProofLib.Filter((x: Thread) => (x.id == r.id), c.threads)| == 1;
      assert forall x: Thread :: (x.id == r.id) ==> (x.id != id);
      FilterSubseq((x: Thread) => (x.id != id), (x: Thread) => (x.id == r.id), c.threads);
      assert ProofLib.Filter((x: Thread) => (x.id == r.id), F)
        == ProofLib.Filter((x: Thread) => (x.id == r.id), ProofLib.Filter((x: Thread) => (x.id != id), c.threads));
    }
    assert !(exists r :: r in after.threads && !(|ProofLib.Filter((x: Thread) => (x.id == r.id), after.threads)| == 1));

    if after.active != "" {
      assert after.active == c.active && c.active != id;
      assert |thread(c, c.active)| == 1;
      ThreadP(after, c.active);
      assert forall x: Thread :: (x.id == c.active) ==> (x.id != id);
      FilterSubseq((x: Thread) => (x.id != id), (t: Thread) => (t.id == c.active), c.threads);
      assert ProofLib.Filter((t: Thread) => (t.id == c.active), F)
        == ProofLib.Filter((t: Thread) => (t.id == c.active), ProofLib.Filter((x: Thread) => (x.id != id), c.threads));
      assert |ProofLib.Filter((t: Thread) => (t.id == c.active), c.threads)| == 1;
    }
  }
}

lemma edit_ensures(c: Chat, id: string, index: int, text: string)
  ensures (inv(c) ==> canEdit(c, id, index, text) ==> alwaysTurnsAlternate(edit(c, id, index, text)))
  ensures (inv(c) ==> canEdit(c, id, index, text) ==> alwaysActiveIsRealOrNone(edit(c, id, index, text)))
  ensures (inv(c) ==> canEdit(c, id, index, text) ==> alwaysThreadIdsUnique(edit(c, id, index, text)))
  ensures (inv(c) ==> canEdit(c, id, index, text) ==> stepAtMostOneThreadChanges(c, "edit", edit(c, id, index, text)))
{
  if inv(c) && canEdit(c, id, index, text) {
    var local_13 := thread(c, id);
    var l14 := (if ((0 <= 0) && (0 < |local_13|)) then local_13[0] else Thread(id, c.model, []));
    var t0 := local_13[0];
    assert l14 == t0;
    var freshT := t0.(messages := (takeMessages(t0.messages, index) + [Message(Role.User, text, t0.model)]));
    var res := replaceThread(c.threads, id, freshT);
    var after := edit(c, id, index, text);
    assert after == c.(threads := res);
    ReplaceAll(c.threads, id, freshT);
    ThreadP(c, id);
    ProofLib.FilterMember((t: Thread) => (t.id == id), c.threads, t0);
    assert t0 in c.threads && t0.id == id;
    assert freshT.id == id;

    UniqueReplace(c, id, freshT);
    ActiveReplace(c, id, freshT);

    assert alternates(t0.messages);
    var pre := takeMessages(t0.messages, index);
    TakeIs(t0.messages, index);
    assert index < |t0.messages| && index >= 0;
    assert pre == t0.messages[0..index];
    AltPrefix(t0.messages, index);
    assert alternates(pre);
    if index == 0 {
      assert pre == [];
      AltHead([Message(Role.User, text, t0.model)]);
      assert alternates([Message(Role.User, text, t0.model)]);
      assert alternates(pre + [Message(Role.User, text, t0.model)]);
    } else {
      assert |pre| > 0;
      assert pre[|pre| - 1] == t0.messages[index - 1];
      AltAt(t0.messages, index);
      assert t0.messages[index - 1].role != t0.messages[index].role;
      var l12 := (if ((0 <= index) && (index < |t0.messages|)) then t0.messages[index] else Message(Role.Assistant, "", ""));
      assert l12 == t0.messages[index];
      assert t0.messages[index].role.User?;
      assert t0.messages[index - 1].role.Assistant?;
      AltAppend(pre, Message(Role.User, text, t0.model));
    }
    assert alternates(freshT.messages);

    forall t | t in res
      ensures alternates(t.messages)
    {
      var j :| 0 <= j < |res| && res[j] == t;
      if c.threads[j].id == id {
        assert t == freshT;
      } else {
        assert t == c.threads[j];
        assert c.threads[j] in c.threads;
      }
    }
    assert !(exists t :: t in res && !(alternates(t.messages)));
  }
}

// spec/app/console/chat.md, "Story: Talk to a model / Sending starts or extends
// a thread": other threads ride along untouched.
lemma lawSendKeepsOtherThreads_ensures(c: Chat, id: string, model: string, text: string)
  ensures (lawSendKeepsOtherThreads(c, id, model, text) == true)
{
  if alwaysThreadIdsUnique(c) {
    var res := send(c, id, model, text);
    UniqueP(c);
    forall t' | t' in ProofLib.Filter((t: Thread) => (t.id != id), c.threads)
      ensures |ProofLib.Filter((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads)| == 1
    {
      ProofLib.FilterMember((t: Thread) => (t.id != id), c.threads, t');
      assert t' in c.threads && t'.id != id;
      assert |ProofLib.Filter((x: Thread) => (x.id == t'.id), c.threads)| == 1;

      var local_0 := thread(c, id);
      ProofLib.FilterImpLength((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), (x: Thread) => (x.id == t'.id), res.threads);
      if |local_0| == 0 {
        var newT := Thread(id, model, [Message(Role.User, text, model)]);
        assert res.threads == [newT] + c.threads;
        assert res.threads[0] == newT && newT.id == id;
        FilterConcat((x: Thread) => (x.id == t'.id), [newT], c.threads);
        ProofLib.FilterNone((x: Thread) => (x.id == t'.id), [newT]);
        assert |ProofLib.Filter((x: Thread) => (x.id == t'.id), res.threads)| == 1;
        assert t' in c.threads;
        assert t' in res.threads;
        assert (t'.id == t'.id) && (t'.messages == t'.messages);
        ProofLib.FilterMember((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads, t');
        assert |ProofLib.Filter((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads)| >= 1;
      } else {
        var t0 := local_0[0];
        var l1 := (if ((0 <= 0) && (0 < |local_0|)) then local_0[0] else Thread(id, model, []));
        assert l1 == t0;
        var msgs := (if (((|local_0| > 0) && (|l1.messages| > 0)) && lastMessage(l1).role.User?) then ((if ((0 <= (|l1.messages| - 1)) && ((|l1.messages| - 1) < |l1.messages|)) then (l1.messages[0..(|l1.messages| - 1)] + l1.messages[((|l1.messages| - 1) + 1)..]) else l1.messages) + [Message(Role.User, text, model)]) else (l1.messages + [Message(Role.User, text, model)]));
        var t2 := l1.(model := model, messages := msgs);
        var F := ProofLib.Filter((x: Thread) => (x.id != id), c.threads);
        assert res.threads == [t2] + F;
        assert res.threads[0] == t2;
        assert t2.id == id by {
          ThreadP(c, id);
          assert t0 in thread(c, id);
          ProofLib.FilterMember((t: Thread) => (t.id == id), c.threads, t0);
        }
        FilterConcat((x: Thread) => (x.id == t'.id), [t2], F);
        ProofLib.FilterNone((x: Thread) => (x.id == t'.id), [t2]);
        assert forall x: Thread :: (x.id == t'.id) ==> (x.id != id);
        FilterSubseq((x: Thread) => (x.id != id), (x: Thread) => (x.id == t'.id), c.threads);
        assert ProofLib.Filter((x: Thread) => (x.id == t'.id), F)
          == ProofLib.Filter((x: Thread) => (x.id == t'.id), ProofLib.Filter((x: Thread) => (x.id != id), c.threads));
        assert |ProofLib.Filter((x: Thread) => (x.id == t'.id), F)| == 1;
        assert |ProofLib.Filter((x: Thread) => (x.id == t'.id), res.threads)| == 1;
        assert t' in F;
        assert t' in res.threads;
        ProofLib.FilterMember((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads, t');
        assert |ProofLib.Filter((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads)| >= 1;
      }
      assert |ProofLib.Filter((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads)| == 1;
    }
    assert !(exists t' :: t' in ProofLib.Filter((t: Thread) => (t.id != id), c.threads) && !(|ProofLib.Filter((x: Thread) => ((x.id == t'.id) && (x.messages == t'.messages)), res.threads)| == 1));
  }
}
