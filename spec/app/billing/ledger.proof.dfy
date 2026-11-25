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
