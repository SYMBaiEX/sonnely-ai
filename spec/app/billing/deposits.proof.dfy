// spec/app/billing/deposits.md, "Every intent's reference is unique": findIntent is a filter, and a
// reference kept once keeps it through every transition.

lemma findIntentIsFilter(d: Deposits, reference: string)
  ensures findIntent(d, reference) == ProofLib.Filter((i: Intent) => (i.reference == reference), d.intents)
{
}

lemma uniqueReference(d: Deposits, x: Intent, y: Intent)
  requires alwaysReferencesUnique(d)
  requires x in d.intents && y in d.intents && y.reference == x.reference
  ensures x == y
{
  findIntentIsFilter(d, x.reference);
  ProofLib.FilterMember((i: Intent) => (i.reference == x.reference), d.intents, x);
  ProofLib.FilterMember((i: Intent) => (i.reference == x.reference), d.intents, y);
}

lemma open_ensures(d: Deposits, reference: string, wallet: string, asset: Asset, amount: int, atomic: int, createdAt: int, expiresAt: int)
  ensures (inv(d) ==> canOpen(d, reference, wallet, amount, atomic, createdAt, expiresAt) ==> alwaysReferencesUnique(open(d, reference, wallet, asset, amount, atomic, createdAt, expiresAt)))
  ensures (inv(d) ==> canOpen(d, reference, wallet, amount, atomic, createdAt, expiresAt) ==> alwaysIntentsHoldTerms(open(d, reference, wallet, asset, amount, atomic, createdAt, expiresAt)))
  ensures (inv(d) ==> canOpen(d, reference, wallet, amount, atomic, createdAt, expiresAt) ==> alwaysSignaturesUnique(open(d, reference, wallet, asset, amount, atomic, createdAt, expiresAt)))
  ensures (inv(d) ==> canOpen(d, reference, wallet, amount, atomic, createdAt, expiresAt) ==> stepIntentsOnlyMoveForward(d, open(d, reference, wallet, asset, amount, atomic, createdAt, expiresAt)))
{
  if inv(d) && canOpen(d, reference, wallet, amount, atomic, createdAt, expiresAt) {
    var n := Intent(reference, wallet, asset, amount, atomic, createdAt, expiresAt, DepositStatus.Pending);
    var after := open(d, reference, wallet, asset, amount, atomic, createdAt, expiresAt);
    assert after.intents == d.intents + [n];
    findIntentIsFilter(d, reference);
    ProofLib.FilterNone((i: Intent) => (i.reference == reference), d.intents);
    forall x | x in after.intents
      ensures |findIntent(after, x.reference)| == 1
    {
      findIntentIsFilter(after, x.reference);
      ProofLib.FilterAppend((i: Intent) => (i.reference == x.reference), d.intents, n);
      if x in d.intents {
        findIntentIsFilter(d, x.reference);
        assert x.reference != reference;
      } else {
        assert x == n;
        assert x.reference == reference;
        assert forall i :: i in d.intents ==> i.reference != x.reference;
        ProofLib.FilterNone((i: Intent) => (i.reference == x.reference), d.intents);
      }
    }
    forall i | i in d.intents
      ensures !(exists j :: j in after.intents && !(((j.reference != i.reference) || forwardFrom(i, j))))
    {
      forall j | j in after.intents
        ensures (j.reference != i.reference) || forwardFrom(i, j)
      {
        if j.reference == i.reference {
          assert i.reference != reference;
          assert j in d.intents;
          uniqueReference(d, i, j);
          assert forwardFrom(i, i);
        }
      }
    }
  }
}

lemma finalize_ensures(d: Deposits, reference: string, signature: string, wallet: string, asset: Asset, amount: int, atomic: int, paidAt: int)
  ensures (inv(d) ==> canFinalize(d, reference, signature, wallet, asset, amount, atomic, paidAt) ==> alwaysReferencesUnique(finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt)))
  ensures (inv(d) ==> canFinalize(d, reference, signature, wallet, asset, amount, atomic, paidAt) ==> alwaysIntentsHoldTerms(finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt)))
  ensures (inv(d) ==> canFinalize(d, reference, signature, wallet, asset, amount, atomic, paidAt) ==> alwaysSignaturesUnique(finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt)))
  ensures (inv(d) ==> canFinalize(d, reference, signature, wallet, asset, amount, atomic, paidAt) ==> stepIntentsOnlyMoveForward(d, finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt)))
{
  if inv(d) && canFinalize(d, reference, signature, wallet, asset, amount, atomic, paidAt) {
    var after := finalize(d, reference, signature, wallet, asset, amount, atomic, paidAt);
    assert |after.intents| == |d.intents|;
    forall k | 0 <= k < |d.intents|
      ensures after.intents[k].reference == d.intents[k].reference
      ensures after.intents[k] == (if ((d.intents[k].reference == reference) && (d.intents[k].status.Pending? || d.intents[k].status.Expired?)) then d.intents[k].(status := Finalized(signature)) else d.intents[k])
    {
    }
    forall x | x in after.intents
      ensures |findIntent(after, x.reference)| == 1
    {
      assert exists k :: 0 <= k < |after.intents| && after.intents[k] == x;
      findIntentIsFilter(after, x.reference);
      ProofLib.FilterLengthPointwise((i: Intent) => (i.reference == x.reference), (i: Intent) => (i.reference == x.reference), d.intents, after.intents);
      assert exists k :: 0 <= k < |after.intents| && after.intents[k] == x;
      var k :| 0 <= k < |after.intents| && after.intents[k] == x;
      assert d.intents[k].reference == x.reference;
      assert d.intents[k] in d.intents;
      assert |findIntent(d, d.intents[k].reference)| == 1;
    }
    forall i | i in d.intents
      ensures !(exists j :: j in after.intents && !(((j.reference != i.reference) || forwardFrom(i, j))))
    {
      assert |findIntent(after, i.reference)| == 1;
      forall j | j in after.intents
        ensures (j.reference != i.reference) || forwardFrom(i, j)
      {
        if j.reference == i.reference {
          assert exists k :: 0 <= k < |after.intents| && after.intents[k] == j;
          var k :| 0 <= k < |after.intents| && after.intents[k] == j;
          assert d.intents[k].reference == i.reference;
          uniqueReference(d, i, d.intents[k]);
          assert d.intents[k] == i;
          if i.reference == reference && (i.status.Pending? || i.status.Expired?) {
            assert j == i.(status := Finalized(signature));
            assert forwardFrom(i, j);
          } else {
            assert j == i;
            assert forwardFrom(i, i);
          }
        }
      }
    }
  }
}

lemma expire_ensures(d: Deposits, reference: string, now: int)
  ensures (inv(d) ==> canExpire(d, reference, now) ==> alwaysReferencesUnique(expire(d, reference, now)))
  ensures (inv(d) ==> canExpire(d, reference, now) ==> alwaysIntentsHoldTerms(expire(d, reference, now)))
  ensures (inv(d) ==> canExpire(d, reference, now) ==> alwaysSignaturesUnique(expire(d, reference, now)))
  ensures (inv(d) ==> canExpire(d, reference, now) ==> stepIntentsOnlyMoveForward(d, expire(d, reference, now)))
{
  if inv(d) && canExpire(d, reference, now) {
    var after := expire(d, reference, now);
    assert |after.intents| == |d.intents|;
    forall k | 0 <= k < |d.intents|
      ensures after.intents[k].reference == d.intents[k].reference
      ensures after.intents[k] == (if (((d.intents[k].reference == reference) && d.intents[k].status.Pending?) && (d.intents[k].expiresAt <= now)) then d.intents[k].(status := DepositStatus.Expired) else d.intents[k])
    {
    }
    forall x | x in after.intents
      ensures |findIntent(after, x.reference)| == 1
    {
      assert exists k :: 0 <= k < |after.intents| && after.intents[k] == x;
      findIntentIsFilter(after, x.reference);
      ProofLib.FilterLengthPointwise((i: Intent) => (i.reference == x.reference), (i: Intent) => (i.reference == x.reference), d.intents, after.intents);
      assert exists k :: 0 <= k < |after.intents| && after.intents[k] == x;
      var k :| 0 <= k < |after.intents| && after.intents[k] == x;
      assert d.intents[k].reference == x.reference;
      assert d.intents[k] in d.intents;
      assert |findIntent(d, d.intents[k].reference)| == 1;
    }
    forall i | i in d.intents
      ensures !(exists j :: j in after.intents && !(((j.reference != i.reference) || forwardFrom(i, j))))
    {
      assert |findIntent(after, i.reference)| == 1;
      forall j | j in after.intents
        ensures (j.reference != i.reference) || forwardFrom(i, j)
      {
        if j.reference == i.reference {
          assert exists k :: 0 <= k < |after.intents| && after.intents[k] == j;
          var k :| 0 <= k < |after.intents| && after.intents[k] == j;
          assert d.intents[k].reference == i.reference;
          uniqueReference(d, i, d.intents[k]);
          assert d.intents[k] == i;
          if i.reference == reference && i.status.Pending? && i.expiresAt <= now {
            assert j == i.(status := DepositStatus.Expired);
            assert forwardFrom(i, j);
          } else {
            assert j == i;
            assert forwardFrom(i, i);
          }
        }
      }
    }
  }
}
