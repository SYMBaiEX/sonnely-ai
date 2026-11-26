// spec/app/billing/payouts.md, "References are never reused": findPayout is a filter, a reference
// kept once stays unique through append, and a status-only map keeps every reference in place.

lemma findPayoutIsFilter(p: Payouts, reference: string)
  ensures findPayout(p, reference) == ProofLib.Filter((row: Payout) => (row.reference == reference), p.payouts)
{
}

lemma uniquePayout(p: Payouts, x: Payout, y: Payout)
  requires alwaysReferencesUnique(p)
  requires x in p.payouts && y in p.payouts && y.reference == x.reference
  ensures x == y
{
  findPayoutIsFilter(p, x.reference);
  ProofLib.FilterMember((row: Payout) => (row.reference == x.reference), p.payouts, x);
  ProofLib.FilterMember((row: Payout) => (row.reference == x.reference), p.payouts, y);
}

lemma uniqueAfterReferenceMap(before: Payouts, after: Payouts)
  requires alwaysReferencesUnique(before)
  requires |after.payouts| == |before.payouts|
  requires forall k :: 0 <= k < |before.payouts| ==> after.payouts[k].reference == before.payouts[k].reference
  ensures alwaysReferencesUnique(after)
{
  forall x | x in after.payouts
    ensures |findPayout(after, x.reference)| == 1
  {
    var k :| 0 <= k < |after.payouts| && after.payouts[k] == x;
    findPayoutIsFilter(after, x.reference);
    ProofLib.FilterLengthPointwise((row: Payout) => (row.reference == x.reference), (row: Payout) => (row.reference == x.reference), before.payouts, after.payouts);
    assert before.payouts[k].reference == x.reference;
    assert before.payouts[k] in before.payouts;
    assert |findPayout(before, before.payouts[k].reference)| == 1;
  }
}

lemma forwardAfterReferenceMap(before: Payouts, after: Payouts)
  requires alwaysReferencesUnique(before)
  requires |after.payouts| == |before.payouts|
  requires forall k :: 0 <= k < |before.payouts| ==>
    after.payouts[k].reference == before.payouts[k].reference && forwardFrom(before.payouts[k], after.payouts[k])
  ensures stepPayoutsOnlyMoveForward(before, after)
{
  uniqueAfterReferenceMap(before, after);
  forall row | row in before.payouts
    ensures |findPayout(after, row.reference)| == 1 &&
      !(exists candidate :: candidate in after.payouts && !((candidate.reference != row.reference) || forwardFrom(row, candidate)))
  {
    var k :| 0 <= k < |before.payouts| && before.payouts[k] == row;
    assert after.payouts[k] in after.payouts;
    assert after.payouts[k].reference == row.reference;
    assert |findPayout(after, row.reference)| == 1;
    forall candidate | candidate in after.payouts
      ensures (candidate.reference != row.reference) || forwardFrom(row, candidate)
    {
      if candidate.reference == row.reference {
        var j :| 0 <= j < |after.payouts| && after.payouts[j] == candidate;
        assert before.payouts[j].reference == row.reference;
        uniquePayout(before, row, before.payouts[j]);
        assert before.payouts[j] == row;
        assert forwardFrom(row, after.payouts[j]);
      }
    }
  }
}

lemma prepare_ensures(p: Payouts, reference: string, destination: string, amount: int, throughEntry: int, chargeTotal: int, preparedAt: int, preparedBy: string)
  ensures (inv(p) ==> canPrepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy) ==> alwaysReferencesUnique(prepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy)))
  ensures (inv(p) ==> canPrepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy) ==> alwaysPayoutsHoldTerms(prepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy)))
  ensures (inv(p) ==> canPrepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy) ==> alwaysSignaturesUnique(prepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy)))
  ensures (inv(p) ==> canPrepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy) ==> stepPayoutsOnlyMoveForward(p, prepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy)))
{
  if inv(p) && canPrepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy) {
    var row := Payout(reference, destination, amount, preparedAt, throughEntry, chargeTotal, preparedBy, PayoutStatus.Prepared);
    var after := prepare(p, reference, destination, amount, throughEntry, chargeTotal, preparedAt, preparedBy);
    assert after.payouts == p.payouts + [row];
    findPayoutIsFilter(p, reference);
    ProofLib.FilterNone((x: Payout) => (x.reference == reference), p.payouts);
    forall x | x in after.payouts
      ensures |findPayout(after, x.reference)| == 1
    {
      findPayoutIsFilter(after, x.reference);
      ProofLib.FilterAppend((candidate: Payout) => (candidate.reference == x.reference), p.payouts, row);
      if x in p.payouts {
        assert x.reference != reference;
      } else {
        assert x == row;
        assert forall existing :: existing in p.payouts ==> existing.reference != x.reference;
        ProofLib.FilterNone((candidate: Payout) => (candidate.reference == x.reference), p.payouts);
      }
    }
    forall existing | existing in p.payouts
      ensures !(exists candidate :: candidate in after.payouts && !((candidate.reference != existing.reference) || forwardFrom(existing, candidate)))
    {
      assert |findPayout(after, existing.reference)| == 1;
      forall candidate | candidate in after.payouts
        ensures (candidate.reference != existing.reference) || forwardFrom(existing, candidate)
      {
        if candidate.reference == existing.reference {
          assert existing.reference != reference;
          assert candidate in p.payouts;
          uniquePayout(p, existing, candidate);
          assert forwardFrom(existing, existing);
        }
      }
    }
  }
}

lemma execute_ensures(p: Payouts, reference: string, signature: string, executedAt: int)
  ensures (inv(p) ==> canExecute(p, reference, signature, executedAt) ==> alwaysReferencesUnique(execute(p, reference, signature, executedAt)))
  ensures (inv(p) ==> canExecute(p, reference, signature, executedAt) ==> alwaysPayoutsHoldTerms(execute(p, reference, signature, executedAt)))
  ensures (inv(p) ==> canExecute(p, reference, signature, executedAt) ==> alwaysSignaturesUnique(execute(p, reference, signature, executedAt)))
  ensures (inv(p) ==> canExecute(p, reference, signature, executedAt) ==> stepPayoutsOnlyMoveForward(p, execute(p, reference, signature, executedAt)))
{
  if inv(p) && canExecute(p, reference, signature, executedAt) {
    var after := execute(p, reference, signature, executedAt);
    assert |after.payouts| == |p.payouts|;
    forall k | 0 <= k < |p.payouts|
      ensures after.payouts[k].reference == p.payouts[k].reference
      ensures forwardFrom(p.payouts[k], after.payouts[k])
    {
    }
    forwardAfterReferenceMap(p, after);
  }
}

lemma markVerified_ensures(p: Payouts, reference: string, signature: string, destination: string, amount: int, verifiedAt: int)
  ensures (inv(p) ==> canMarkVerified(p, reference, signature, destination, amount, verifiedAt) ==> alwaysReferencesUnique(markVerified(p, reference, signature, destination, amount, verifiedAt)))
  ensures (inv(p) ==> canMarkVerified(p, reference, signature, destination, amount, verifiedAt) ==> alwaysPayoutsHoldTerms(markVerified(p, reference, signature, destination, amount, verifiedAt)))
  ensures (inv(p) ==> canMarkVerified(p, reference, signature, destination, amount, verifiedAt) ==> alwaysSignaturesUnique(markVerified(p, reference, signature, destination, amount, verifiedAt)))
  ensures (inv(p) ==> canMarkVerified(p, reference, signature, destination, amount, verifiedAt) ==> stepPayoutsOnlyMoveForward(p, markVerified(p, reference, signature, destination, amount, verifiedAt)))
{
  if inv(p) && canMarkVerified(p, reference, signature, destination, amount, verifiedAt) {
    var after := markVerified(p, reference, signature, destination, amount, verifiedAt);
    assert |after.payouts| == |p.payouts|;
    forall k | 0 <= k < |p.payouts|
      ensures after.payouts[k].reference == p.payouts[k].reference
      ensures forwardFrom(p.payouts[k], after.payouts[k])
    {
    }
    forwardAfterReferenceMap(p, after);
  }
}

lemma markFailed_ensures(p: Payouts, reference: string, signature: string, failedAt: int, reason: string)
  ensures (inv(p) ==> canMarkFailed(p, reference, signature, failedAt, reason) ==> alwaysReferencesUnique(markFailed(p, reference, signature, failedAt, reason)))
  ensures (inv(p) ==> canMarkFailed(p, reference, signature, failedAt, reason) ==> alwaysPayoutsHoldTerms(markFailed(p, reference, signature, failedAt, reason)))
  ensures (inv(p) ==> canMarkFailed(p, reference, signature, failedAt, reason) ==> alwaysSignaturesUnique(markFailed(p, reference, signature, failedAt, reason)))
  ensures (inv(p) ==> canMarkFailed(p, reference, signature, failedAt, reason) ==> stepPayoutsOnlyMoveForward(p, markFailed(p, reference, signature, failedAt, reason)))
{
  if inv(p) && canMarkFailed(p, reference, signature, failedAt, reason) {
    var after := markFailed(p, reference, signature, failedAt, reason);
    assert |after.payouts| == |p.payouts|;
    forall k | 0 <= k < |p.payouts|
      ensures after.payouts[k].reference == p.payouts[k].reference
      ensures forwardFrom(p.payouts[k], after.payouts[k])
    {
    }
    forwardAfterReferenceMap(p, after);
  }
}

lemma cancel_ensures(p: Payouts, reference: string, cancelledAt: int, reason: string)
  ensures (inv(p) ==> canCancel(p, reference, cancelledAt, reason) ==> alwaysReferencesUnique(cancel(p, reference, cancelledAt, reason)))
  ensures (inv(p) ==> canCancel(p, reference, cancelledAt, reason) ==> alwaysPayoutsHoldTerms(cancel(p, reference, cancelledAt, reason)))
  ensures (inv(p) ==> canCancel(p, reference, cancelledAt, reason) ==> alwaysSignaturesUnique(cancel(p, reference, cancelledAt, reason)))
  ensures (inv(p) ==> canCancel(p, reference, cancelledAt, reason) ==> stepPayoutsOnlyMoveForward(p, cancel(p, reference, cancelledAt, reason)))
{
  if inv(p) && canCancel(p, reference, cancelledAt, reason) {
    var after := cancel(p, reference, cancelledAt, reason);
    assert |after.payouts| == |p.payouts|;
    forall k | 0 <= k < |p.payouts|
      ensures after.payouts[k].reference == p.payouts[k].reference
      ensures forwardFrom(p.payouts[k], after.payouts[k])
    {
    }
    forwardAfterReferenceMap(p, after);
  }
}
