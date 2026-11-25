// spec/app/billing/ledger.md, "Entries are never rewritten or removed": a fold of the same ledger
// plus one entry, a filter that only names credits, and a prefix that is the ledger itself.

lemma sumAppend(l: Ledger, x: Entry)
  ensures sumOf(l.entries + [x]) == sumOf(l.entries) + contribution(x)
{
  ProofLib.FoldLeftAppend((total: int, e: Entry) => (total + contribution(e)), 0, l.entries, x);
}

lemma prefixFold(shorter: seq<Entry>, longer: seq<Entry>)
  requires |shorter| <= |longer|
  requires forall i :: 0 <= i < |shorter| ==> shorter[i] == longer[i]
  ensures Std.Collections.Seq.FoldLeft((i: int, e: Entry) => (if ((i >= 0) && ((if ((0 <= i) && (i < |longer|)) then longer[i] else e) == e)) then (i + 1) else (0 - 1)), 0, shorter) == |shorter|
  decreases |shorter|
{
  if |shorter| > 0 {
    var init := shorter[..|shorter| - 1];
    prefixFold(init, longer);
    ProofLib.FoldLeftAppend((i: int, e: Entry) => (if ((i >= 0) && ((if ((0 <= i) && (i < |longer|)) then longer[i] else e) == e)) then (i + 1) else (0 - 1)), 0, init, shorter[|shorter| - 1]);
    assert init + [shorter[|shorter| - 1]] == shorter;
    assert |init| < |longer| && longer[|init|] == shorter[|init|];
  }
}

lemma prefixSelf(xs: seq<Entry>, ys: seq<Entry>)
  ensures isPrefix(xs, xs + ys)
{
  prefixFold(xs, xs + ys);
}

lemma creditsOnceP(l: Ledger)
  ensures alwaysCreditsOnce(l) == !(exists e :: e in l.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries)| == 1)))
{
}

lemma credit_ensures(l: Ledger, wallet: string, detail: string, amount: int)
  ensures (inv(l) ==> canCredit(l, wallet, detail, amount) ==> alwaysBalanceIsTheSum(credit(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCredit(l, wallet, detail, amount) ==> alwaysBalanceIsNotNegative(credit(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCredit(l, wallet, detail, amount) ==> alwaysCreditsOnce(credit(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCredit(l, wallet, detail, amount) ==> stepEntriesAppendOnly(l, credit(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCredit(l, wallet, detail, amount) ==> stepChargeIsCovered(l, "credit", credit(l, wallet, detail, amount)))
{
  if inv(l) && canCredit(l, wallet, detail, amount) {
    var after := credit(l, wallet, detail, amount);
    if !(exists e :: e in l.entries && (e.kind.Credit? && (e.detail == detail))) {
      var x := Entry(wallet, EntryKind.Credit, detail, amount);
      assert after.entries == l.entries + [x];
      assert after.balance == l.balance + amount;
      sumAppend(l, x);
      prefixSelf(l.entries, [x]);
      creditsOnceP(l);
      creditsOnceP(after);
      forall e | e in after.entries
        ensures (!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)
      {
        if e.kind.Credit? {
          ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries, x);
          if e in l.entries {
            assert e.detail != detail;
            assert !(x.kind.Credit? && x.detail == e.detail);
          } else {
            assert e == x;
            assert e.detail == detail;
            assert forall i :: i in l.entries ==> !(i.kind.Credit? && (i.detail == e.detail));
            ProofLib.FilterNone((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries);
            assert x.kind.Credit? && x.detail == e.detail;
          }
        }
      }
      assert !(exists e :: e in after.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)));
    } else {
      assert l.entries + [] == l.entries;
      prefixSelf(l.entries, []);
    }
  }
}

lemma charge_ensures(l: Ledger, wallet: string, detail: string, amount: int)
  ensures (inv(l) ==> canCharge(l, wallet, amount) ==> alwaysBalanceIsTheSum(charge(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCharge(l, wallet, amount) ==> alwaysBalanceIsNotNegative(charge(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCharge(l, wallet, amount) ==> alwaysCreditsOnce(charge(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCharge(l, wallet, amount) ==> stepEntriesAppendOnly(l, charge(l, wallet, detail, amount)))
  ensures (inv(l) ==> canCharge(l, wallet, amount) ==> stepChargeIsCovered(l, "charge", charge(l, wallet, detail, amount)))
{
  if inv(l) && canCharge(l, wallet, amount) {
    var x := Entry(wallet, EntryKind.Charge, detail, amount);
    var after := charge(l, wallet, detail, amount);
    assert after.entries == l.entries + [x];
    assert after.balance == l.balance - amount;
    assert contribution(x) == 0 - amount;
    sumAppend(l, x);
    prefixSelf(l.entries, [x]);
    creditsOnceP(l);
    creditsOnceP(after);
    forall e | e in after.entries
      ensures (!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)
    {
      if e.kind.Credit? {
        assert e != x;
        assert e in l.entries;
        ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries, x);
      }
    }
    assert !(exists e :: e in after.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)));
  }
}

lemma refund_ensures(l: Ledger, wallet: string, detail: string, amount: int)
  ensures (inv(l) ==> canRefund(l, wallet, detail, amount) ==> alwaysBalanceIsTheSum(refund(l, wallet, detail, amount)))
  ensures (inv(l) ==> canRefund(l, wallet, detail, amount) ==> alwaysBalanceIsNotNegative(refund(l, wallet, detail, amount)))
  ensures (inv(l) ==> canRefund(l, wallet, detail, amount) ==> alwaysCreditsOnce(refund(l, wallet, detail, amount)))
  ensures (inv(l) ==> canRefund(l, wallet, detail, amount) ==> stepEntriesAppendOnly(l, refund(l, wallet, detail, amount)))
  ensures (inv(l) ==> canRefund(l, wallet, detail, amount) ==> stepChargeIsCovered(l, "refund", refund(l, wallet, detail, amount)))
{
  if inv(l) && canRefund(l, wallet, detail, amount) {
    var x := Entry(wallet, EntryKind.Refund, detail, amount);
    var after := refund(l, wallet, detail, amount);
    assert after.entries == l.entries + [x];
    assert after.balance == l.balance + amount;
    assert contribution(x) == amount;
    sumAppend(l, x);
    prefixSelf(l.entries, [x]);
    creditsOnceP(l);
    creditsOnceP(after);
    forall e | e in after.entries
      ensures (!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)
    {
      if e.kind.Credit? {
        assert e != x;
        assert e in l.entries;
        ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries, x);
      }
    }
    assert !(exists e :: e in after.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)));
  }
}

lemma reserve_ensures(l: Ledger, wallet: string, detail: string, amount: int)
  ensures (inv(l) ==> canReserve(l, wallet, detail, amount) ==> alwaysBalanceIsTheSum(reserve(l, wallet, detail, amount)))
  ensures (inv(l) ==> canReserve(l, wallet, detail, amount) ==> alwaysBalanceIsNotNegative(reserve(l, wallet, detail, amount)))
  ensures (inv(l) ==> canReserve(l, wallet, detail, amount) ==> alwaysCreditsOnce(reserve(l, wallet, detail, amount)))
  ensures (inv(l) ==> canReserve(l, wallet, detail, amount) ==> stepEntriesAppendOnly(l, reserve(l, wallet, detail, amount)))
  ensures (inv(l) ==> canReserve(l, wallet, detail, amount) ==> stepChargeIsCovered(l, "reserve", reserve(l, wallet, detail, amount)))
{
  if inv(l) && canReserve(l, wallet, detail, amount) {
    var x := Entry(wallet, EntryKind.Reserve, detail, amount);
    var after := reserve(l, wallet, detail, amount);
    assert after.entries == l.entries + [x];
    assert after.balance == l.balance - amount;
    assert contribution(x) == 0 - amount;
    sumAppend(l, x);
    prefixSelf(l.entries, [x]);
    creditsOnceP(l);
    creditsOnceP(after);
    forall e | e in after.entries
      ensures (!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)
    {
      if e.kind.Credit? {
        assert e != x;
        assert e in l.entries;
        ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries, x);
      }
    }
    assert !(exists e :: e in after.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)));
  }
}

lemma settleHold_ensures(l: Ledger, wallet: string, detail: string, amount: int)
  ensures (inv(l) ==> canSettleHold(l, wallet, detail, amount) ==> alwaysBalanceIsTheSum(settleHold(l, wallet, detail, amount)))
  ensures (inv(l) ==> canSettleHold(l, wallet, detail, amount) ==> alwaysBalanceIsNotNegative(settleHold(l, wallet, detail, amount)))
  ensures (inv(l) ==> canSettleHold(l, wallet, detail, amount) ==> alwaysCreditsOnce(settleHold(l, wallet, detail, amount)))
  ensures (inv(l) ==> canSettleHold(l, wallet, detail, amount) ==> stepEntriesAppendOnly(l, settleHold(l, wallet, detail, amount)))
  ensures (inv(l) ==> canSettleHold(l, wallet, detail, amount) ==> stepChargeIsCovered(l, "settleHold", settleHold(l, wallet, detail, amount)))
{
  if inv(l) && canSettleHold(l, wallet, detail, amount) {
    var held := heldOf(l, wallet, detail);
    var released := Entry(wallet, EntryKind.Release, detail, held);
    var after := settleHold(l, wallet, detail, amount);
    assert contribution(released) == held;
    if amount == 0 {
      assert after.entries == l.entries + [released];
      assert after.balance == l.balance + held;
      sumAppend(l, released);
      prefixSelf(l.entries, [released]);
    } else {
      var charged := Entry(wallet, EntryKind.Charge, detail, amount);
      var mid := Ledger(0, l.entries + [released]);
      assert after.entries == mid.entries + [charged];
      assert after.balance == l.balance + held - amount;
      assert contribution(charged) == 0 - amount;
      sumAppend(l, released);
      sumAppend(mid, charged);
      prefixSelf(l.entries, [released, charged]);
      assert mid.entries + [charged] == l.entries + [released, charged];
    }
    creditsOnceP(l);
    creditsOnceP(after);
    forall e | e in after.entries
      ensures (!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)
    {
      if e.kind.Credit? {
        assert e in l.entries;
        ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries, released);
        if amount != 0 {
          var charged := Entry(wallet, EntryKind.Charge, detail, amount);
          ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries + [released], charged);
        }
      }
    }
    assert !(exists e :: e in after.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)));
  }
}

lemma release_ensures(l: Ledger, wallet: string, detail: string)
  ensures (inv(l) ==> canRelease(l, wallet, detail) ==> alwaysBalanceIsTheSum(release(l, wallet, detail)))
  ensures (inv(l) ==> canRelease(l, wallet, detail) ==> alwaysBalanceIsNotNegative(release(l, wallet, detail)))
  ensures (inv(l) ==> canRelease(l, wallet, detail) ==> alwaysCreditsOnce(release(l, wallet, detail)))
  ensures (inv(l) ==> canRelease(l, wallet, detail) ==> stepEntriesAppendOnly(l, release(l, wallet, detail)))
  ensures (inv(l) ==> canRelease(l, wallet, detail) ==> stepChargeIsCovered(l, "release", release(l, wallet, detail)))
{
  if inv(l) && canRelease(l, wallet, detail) {
    var held := heldOf(l, wallet, detail);
    var x := Entry(wallet, EntryKind.Release, detail, held);
    var after := release(l, wallet, detail);
    assert after.entries == l.entries + [x];
    assert after.balance == l.balance + held;
    assert contribution(x) == held;
    sumAppend(l, x);
    prefixSelf(l.entries, [x]);
    creditsOnceP(l);
    creditsOnceP(after);
    forall e | e in after.entries
      ensures (!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)
    {
      if e.kind.Credit? {
        assert e != x;
        assert e in l.entries;
        ProofLib.FilterAppend((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), l.entries, x);
      }
    }
    assert !(exists e :: e in after.entries && !((!e.kind.Credit?) || (|ProofLib.Filter((j: Entry) => (j.kind.Credit? && (j.detail == e.detail)), after.entries)| == 1)));
  }
}
