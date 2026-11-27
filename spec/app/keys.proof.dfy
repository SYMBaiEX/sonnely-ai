// spec/app/keys.md, "Ids, prefixes and hashes are unique across the registry" and the step
// rules: the registry's filters as ProofLib.Filter, so the library's lemmas apply.

lemma withIdIs(s: Keys, id: string)
  ensures keyWithId(s, id) == ProofLib.Filter((k: Key) => (k.id == id), s.keys)
{
}

lemma withIdAll(s: Keys, id: string)
  ensures forall a :: (a in keyWithId(s, id)) == (a in s.keys && (a.id == id))
{
  withIdIs(s, id);
  forall a ensures (a in keyWithId(s, id)) == (a in s.keys && (a.id == id)) {
    ProofLib.FilterMember((k: Key) => (k.id == id), s.keys, a);
  }
}


lemma ownedKeyWithIdIs(s: Keys, id: string, wallet: string)
  ensures ownedKeyWithId(s, id, wallet) == ProofLib.Filter((k: Key) => ((k.id == id) && (k.wallet == wallet)), s.keys)
{
}

lemma ownedKeyWithIdAll(s: Keys, id: string, wallet: string)
  ensures forall a :: (a in ownedKeyWithId(s, id, wallet)) == (a in s.keys && (a.id == id) && (a.wallet == wallet))
{
  ownedKeyWithIdIs(s, id, wallet);
  forall a ensures (a in ownedKeyWithId(s, id, wallet)) == (a in s.keys && (a.id == id) && (a.wallet == wallet)) {
    ProofLib.FilterMember((k: Key) => ((k.id == id) && (k.wallet == wallet)), s.keys, a);
  }
}

lemma uniqueP(s: Keys)
  ensures alwaysCredentialsAreUnique(s) == !(exists k :: k in s.keys && !((|ProofLib.Filter((o: Key) => (o.id == k.id), s.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.prefix == k.prefix), s.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.hash == k.hash), s.keys)| == 1)))
{
}

lemma sameIdIsSame(s: Keys, a: Key, b: Key)
  requires alwaysCredentialsAreUnique(s)
  requires a in s.keys && b in s.keys && (a.id == b.id)
  ensures a == b
{
  uniqueP(s);
  ProofLib.FilterMember((o: Key) => (o.id == a.id), s.keys, a);
  ProofLib.FilterMember((o: Key) => (o.id == a.id), s.keys, b);
  assert a == ProofLib.Filter((o: Key) => (o.id == a.id), s.keys)[0];
  assert b == ProofLib.Filter((o: Key) => (o.id == a.id), s.keys)[0];
}

// The map transitions update, recordUse and revoke never touch id, prefix or hash, so each
// credential filter counts the same before and after; the pointwise lemmas carry it across.

lemma update_ensures(s: Keys, by_: string, id: string, label_: string, cap: int, dailyCap: int, expiresAt: int, now: int)
  ensures (inv(s) ==> canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) ==> alwaysKeysAreWellFormed(update(s, by_, id, label_, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) ==> alwaysCredentialsAreUnique(update(s, by_, id, label_, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) ==> stepKeyWalletNeverChanges(s, update(s, by_, id, label_, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) ==> stepSpendMovesOnlyWithUse(s, "update", update(s, by_, id, label_, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) ==> stepUseMarksUse(s, "update", update(s, by_, id, label_, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) ==> stepRevokedStaysRevoked(s, update(s, by_, id, label_, cap, dailyCap, expiresAt, now)))
{
  if inv(s) && canUpdate(s, by_, id, label_, cap, dailyCap, expiresAt, now) {
    var after := update(s, by_, id, label_, cap, dailyCap, expiresAt, now);
    uniqueP(s);
    forall i | 0 <= i < |after.keys|
      ensures ((after.keys[i].id != "") && (after.keys[i].label_ != "") && (after.keys[i].prefix != "") && (after.keys[i].hash != "") && (after.keys[i].wallet != "") && (|after.keys[i].scopes| >= 1) && capOk(after.keys[i].cap) && capOk(after.keys[i].dailyCap) && (after.keys[i].expiresAt >= 0) && (after.keys[i].createdAt >= 0) && (after.keys[i].lastUsedAt >= 0) && (after.keys[i].spent >= 0) && (after.keys[i].daySpent >= 0) && (after.keys[i].daySpent <= after.keys[i].spent) && ((after.keys[i].lastUsedAt == 0) == (after.keys[i].dayKey == "")) && (!(after.keys[i].lastUsedAt != 0) || (after.keys[i].lastUsedAt >= after.keys[i].createdAt)))
    {
    }
    assert alwaysKeysAreWellFormed(after);
    uniqueP(after);
    forall i | 0 <= i < |after.keys|
      ensures ((|ProofLib.Filter((o: Key) => (o.id == after.keys[i].id), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.prefix == after.keys[i].prefix), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.hash == after.keys[i].hash), after.keys)| == 1))
    {
      assert after.keys[i].id == s.keys[i].id;
      assert after.keys[i].prefix == s.keys[i].prefix;
      assert after.keys[i].hash == s.keys[i].hash;
      ProofLib.FilterLengthPointwise((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == s.keys[i].id), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == after.keys[i].id), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == s.keys[i].prefix), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == after.keys[i].prefix), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == s.keys[i].hash), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == after.keys[i].hash), after.keys);
    }
    assert alwaysCredentialsAreUnique(after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.wallet == k.wallet)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> (after.keys[j].wallet == k.wallet)
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures a.wallet == k.wallet
      {
        withIdAll(after, k.id);
      }
    }
    assert stepKeyWalletNeverChanges(s, after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.spent == k.spent) && (a.lastUsedAt == k.lastUsedAt)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> ((after.keys[j].spent == k.spent) && (after.keys[j].lastUsedAt == k.lastUsedAt))
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures (a.spent == k.spent) && (a.lastUsedAt == k.lastUsedAt)
      {
        withIdAll(after, k.id);
      }
    }
    assert stepSpendMovesOnlyWithUse(s, "update", after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((((a.lastUsedAt == k.lastUsedAt) && (a.dayKey == k.dayKey)) && (a.daySpent == k.daySpent)) || ("update" == "recordUse")))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> ((((after.keys[j].lastUsedAt == k.lastUsedAt) && (after.keys[j].dayKey == k.dayKey)) && (after.keys[j].daySpent == k.daySpent)) || ("update" == "recordUse"))
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures ((((a.lastUsedAt == k.lastUsedAt) && (a.dayKey == k.dayKey)) && (a.daySpent == k.daySpent)) || ("update" == "recordUse"))
      {
        withIdAll(after, k.id);
      }
    }
    assert stepUseMarksUse(s, "update", after);
    forall k | k in s.keys
      ensures ((k.status.Active?) || !(exists a :: a in keyWithId(after, k.id) && !(a.status.Revoked?)))
    {
      if k.status.Revoked? {
        forall j | 0 <= j < |after.keys|
          ensures (after.keys[j].id == k.id) ==> (after.keys[j].status.Revoked?)
        {
          if after.keys[j].id == k.id {
            assert s.keys[j].id == k.id;
            sameIdIsSame(s, s.keys[j], k);
          }
        }
        forall a | a in keyWithId(after, k.id)
          ensures a.status.Revoked?
        {
          withIdAll(after, k.id);
        }
      }
    }
    assert stepRevokedStaysRevoked(s, after);
  }
}

lemma recordUse_ensures(s: Keys, by_: string, id: string, cost: int, day: string, now: int)
  ensures (inv(s) ==> canRecordUse(s, by_, id, cost, day, now) ==> alwaysKeysAreWellFormed(recordUse(s, by_, id, cost, day, now)))
  ensures (inv(s) ==> canRecordUse(s, by_, id, cost, day, now) ==> alwaysCredentialsAreUnique(recordUse(s, by_, id, cost, day, now)))
  ensures (inv(s) ==> canRecordUse(s, by_, id, cost, day, now) ==> stepKeyWalletNeverChanges(s, recordUse(s, by_, id, cost, day, now)))
  ensures (inv(s) ==> canRecordUse(s, by_, id, cost, day, now) ==> stepSpendMovesOnlyWithUse(s, "recordUse", recordUse(s, by_, id, cost, day, now)))
  ensures (inv(s) ==> canRecordUse(s, by_, id, cost, day, now) ==> stepUseMarksUse(s, "recordUse", recordUse(s, by_, id, cost, day, now)))
  ensures (inv(s) ==> canRecordUse(s, by_, id, cost, day, now) ==> stepRevokedStaysRevoked(s, recordUse(s, by_, id, cost, day, now)))
{
  if inv(s) && canRecordUse(s, by_, id, cost, day, now) {
    var after := recordUse(s, by_, id, cost, day, now);
    var w :| w in ownedKeyWithId(s, id, by_) && w.status.Active? && (now >= w.createdAt) && (now >= w.lastUsedAt);
    ownedKeyWithIdAll(s, id, by_);
    withIdAll(s, id);
    uniqueP(s);
    forall i | 0 <= i < |after.keys|
      ensures ((after.keys[i].id != "") && (after.keys[i].label_ != "") && (after.keys[i].prefix != "") && (after.keys[i].hash != "") && (after.keys[i].wallet != "") && (|after.keys[i].scopes| >= 1) && capOk(after.keys[i].cap) && capOk(after.keys[i].dailyCap) && (after.keys[i].expiresAt >= 0) && (after.keys[i].createdAt >= 0) && (after.keys[i].lastUsedAt >= 0) && (after.keys[i].spent >= 0) && (after.keys[i].daySpent >= 0) && (after.keys[i].daySpent <= after.keys[i].spent) && ((after.keys[i].lastUsedAt == 0) == (after.keys[i].dayKey == "")) && (!(after.keys[i].lastUsedAt != 0) || (after.keys[i].lastUsedAt >= after.keys[i].createdAt)))
    {
      if s.keys[i].id == id {
        sameIdIsSame(s, s.keys[i], w);
      }
    }
    assert alwaysKeysAreWellFormed(after);
    uniqueP(after);
    forall i | 0 <= i < |after.keys|
      ensures ((|ProofLib.Filter((o: Key) => (o.id == after.keys[i].id), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.prefix == after.keys[i].prefix), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.hash == after.keys[i].hash), after.keys)| == 1))
    {
      assert after.keys[i].id == s.keys[i].id;
      assert after.keys[i].prefix == s.keys[i].prefix;
      assert after.keys[i].hash == s.keys[i].hash;
      ProofLib.FilterLengthPointwise((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == s.keys[i].id), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == after.keys[i].id), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == s.keys[i].prefix), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == after.keys[i].prefix), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == s.keys[i].hash), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == after.keys[i].hash), after.keys);
    }
    assert alwaysCredentialsAreUnique(after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.wallet == k.wallet)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> (after.keys[j].wallet == k.wallet)
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures a.wallet == k.wallet
      {
        withIdAll(after, k.id);
      }
    }
    assert stepKeyWalletNeverChanges(s, after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.spent >= k.spent) && (a.lastUsedAt >= k.lastUsedAt)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> ((after.keys[j].spent >= k.spent) && (after.keys[j].lastUsedAt >= k.lastUsedAt))
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
          if k.id == id {
            sameIdIsSame(s, k, w);
          }
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures (a.spent >= k.spent) && (a.lastUsedAt >= k.lastUsedAt)
      {
        withIdAll(after, k.id);
      }
    }
    assert stepSpendMovesOnlyWithUse(s, "recordUse", after);
    assert stepUseMarksUse(s, "recordUse", after);
    forall k | k in s.keys
      ensures ((k.status.Active?) || !(exists a :: a in keyWithId(after, k.id) && !(a.status.Revoked?)))
    {
      if k.status.Revoked? {
        forall j | 0 <= j < |after.keys|
          ensures (after.keys[j].id == k.id) ==> (after.keys[j].status.Revoked?)
        {
          if after.keys[j].id == k.id {
            assert s.keys[j].id == k.id;
            sameIdIsSame(s, s.keys[j], k);
          }
        }
        forall a | a in keyWithId(after, k.id)
          ensures a.status.Revoked?
        {
          withIdAll(after, k.id);
        }
      }
    }
    assert stepRevokedStaysRevoked(s, after);
  }
}

// refundUse: a returned hold lowers spend only on the metered key; the day tally is
// subtracted when the hold belongs to the day the key still carries.

lemma refundUse_ensures(s: Keys, by_: string, id: string, amount: int, day: string, ref: string)
  ensures (inv(s) ==> canRefundUse(s, by_, id, amount, day, ref) ==> alwaysKeysAreWellFormed(refundUse(s, by_, id, amount, day, ref)))
  ensures (inv(s) ==> canRefundUse(s, by_, id, amount, day, ref) ==> alwaysCredentialsAreUnique(refundUse(s, by_, id, amount, day, ref)))
  ensures (inv(s) ==> canRefundUse(s, by_, id, amount, day, ref) ==> stepKeyWalletNeverChanges(s, refundUse(s, by_, id, amount, day, ref)))
  ensures (inv(s) ==> canRefundUse(s, by_, id, amount, day, ref) ==> stepSpendMovesOnlyWithUse(s, "refundUse", refundUse(s, by_, id, amount, day, ref)))
  ensures (inv(s) ==> canRefundUse(s, by_, id, amount, day, ref) ==> stepUseMarksUse(s, "refundUse", refundUse(s, by_, id, amount, day, ref)))
  ensures (inv(s) ==> canRefundUse(s, by_, id, amount, day, ref) ==> stepRevokedStaysRevoked(s, refundUse(s, by_, id, amount, day, ref)))
{
  if inv(s) && canRefundUse(s, by_, id, amount, day, ref) {
    var after := refundUse(s, by_, id, amount, day, ref);
    if ref in s.refundRefs {
      assert after == s;
      uniqueP(s);
      forall k | k in s.keys
        ensures !(exists a :: a in keyWithId(after, k.id) && !((a.wallet == k.wallet)))
      {
        forall j | 0 <= j < |after.keys|
          ensures (after.keys[j].id == k.id) ==> (after.keys[j].wallet == k.wallet)
        {
          if after.keys[j].id == k.id {
            assert s.keys[j].id == k.id;
            sameIdIsSame(s, s.keys[j], k);
          }
        }
        forall a | a in keyWithId(after, k.id)
          ensures a.wallet == k.wallet
        {
          withIdAll(after, k.id);
        }
      }
      assert stepKeyWalletNeverChanges(s, after);
      forall k | k in s.keys
        ensures !(exists a :: a in keyWithId(after, k.id) && !((a.spent <= k.spent) && (a.lastUsedAt == k.lastUsedAt)))
      {
        forall j | 0 <= j < |after.keys|
          ensures (after.keys[j].id == k.id) ==> ((after.keys[j].spent <= k.spent) && (after.keys[j].lastUsedAt == k.lastUsedAt))
        {
          if after.keys[j].id == k.id {
            assert s.keys[j].id == k.id;
            sameIdIsSame(s, s.keys[j], k);
          }
        }
        forall a | a in keyWithId(after, k.id)
          ensures (a.spent <= k.spent) && (a.lastUsedAt == k.lastUsedAt)
        {
          withIdAll(after, k.id);
        }
      }
      assert stepSpendMovesOnlyWithUse(s, "refundUse", after);
      assert stepUseMarksUse(s, "refundUse", after);
      forall k | k in s.keys
        ensures ((k.status.Active?) || !(exists a :: a in keyWithId(after, k.id) && !(a.status.Revoked?)))
      {
        if k.status.Revoked? {
          forall j | 0 <= j < |after.keys|
            ensures (after.keys[j].id == k.id) ==> (after.keys[j].status.Revoked?)
          {
            if after.keys[j].id == k.id {
              assert s.keys[j].id == k.id;
              sameIdIsSame(s, s.keys[j], k);
            }
          }
          forall a | a in keyWithId(after, k.id)
            ensures a.status.Revoked?
          {
            withIdAll(after, k.id);
          }
        }
      }
      assert stepRevokedStaysRevoked(s, after);
    } else {
    var w :| w in ownedKeyWithId(s, id, by_) && w.spent >= amount;
    ownedKeyWithIdAll(s, id, by_);
    withIdAll(s, id);
    uniqueP(s);
    forall i | 0 <= i < |after.keys|
      ensures ((after.keys[i].id != "") && (after.keys[i].label_ != "") && (after.keys[i].prefix != "") && (after.keys[i].hash != "") && (after.keys[i].wallet != "") && (|after.keys[i].scopes| >= 1) && capOk(after.keys[i].cap) && capOk(after.keys[i].dailyCap) && (after.keys[i].expiresAt >= 0) && (after.keys[i].createdAt >= 0) && (after.keys[i].lastUsedAt >= 0) && (after.keys[i].spent >= 0) && (after.keys[i].daySpent >= 0) && (after.keys[i].daySpent <= after.keys[i].spent) && ((after.keys[i].lastUsedAt == 0) == (after.keys[i].dayKey == "")) && (!(after.keys[i].lastUsedAt != 0) || (after.keys[i].lastUsedAt >= after.keys[i].createdAt)))
    {
      if s.keys[i].id == id {
        sameIdIsSame(s, s.keys[i], w);
        if w.dayKey != day {
          assert w.daySpent <= w.spent - amount;
        }
      }
    }
    assert alwaysKeysAreWellFormed(after);
    uniqueP(after);
    forall i | 0 <= i < |after.keys|
      ensures ((|ProofLib.Filter((o: Key) => (o.id == after.keys[i].id), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.prefix == after.keys[i].prefix), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.hash == after.keys[i].hash), after.keys)| == 1))
    {
      assert after.keys[i].id == s.keys[i].id;
      assert after.keys[i].prefix == s.keys[i].prefix;
      assert after.keys[i].hash == s.keys[i].hash;
      ProofLib.FilterLengthPointwise((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == s.keys[i].id), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == after.keys[i].id), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == s.keys[i].prefix), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == after.keys[i].prefix), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == s.keys[i].hash), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == after.keys[i].hash), after.keys);
    }
    assert alwaysCredentialsAreUnique(after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.wallet == k.wallet)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> (after.keys[j].wallet == k.wallet)
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures a.wallet == k.wallet
      {
        withIdAll(after, k.id);
      }
    }
    assert stepKeyWalletNeverChanges(s, after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.spent <= k.spent) && (a.lastUsedAt == k.lastUsedAt)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> ((after.keys[j].spent <= k.spent) && (after.keys[j].lastUsedAt == k.lastUsedAt))
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
          if k.id == id {
            sameIdIsSame(s, k, w);
          }
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures (a.spent <= k.spent) && (a.lastUsedAt == k.lastUsedAt)
      {
        withIdAll(after, k.id);
      }
    }
    assert stepSpendMovesOnlyWithUse(s, "refundUse", after);
    assert stepUseMarksUse(s, "refundUse", after);
    forall k | k in s.keys
      ensures ((k.status.Active?) || !(exists a :: a in keyWithId(after, k.id) && !(a.status.Revoked?)))
    {
      if k.status.Revoked? {
        forall j | 0 <= j < |after.keys|
          ensures (after.keys[j].id == k.id) ==> (after.keys[j].status.Revoked?)
        {
          if after.keys[j].id == k.id {
            assert s.keys[j].id == k.id;
            sameIdIsSame(s, s.keys[j], k);
          }
        }
        forall a | a in keyWithId(after, k.id)
          ensures a.status.Revoked?
        {
          withIdAll(after, k.id);
        }
      }
    }
    assert stepRevokedStaysRevoked(s, after);
    }
  }
}

lemma create_ensures(s: Keys, by_: string, id: string, label_: string, prefix: string, hash: string, project: string, scopes: seq<string>, cap: int, dailyCap: int, expiresAt: int, now: int)
  ensures (inv(s) ==> canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) ==> alwaysKeysAreWellFormed(create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) ==> alwaysCredentialsAreUnique(create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) ==> stepKeyWalletNeverChanges(s, create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) ==> stepSpendMovesOnlyWithUse(s, "create", create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) ==> stepUseMarksUse(s, "create", create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now)))
  ensures (inv(s) ==> canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) ==> stepRevokedStaysRevoked(s, create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now)))
{
  if inv(s) && canCreate(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now) {
    var x := Key(id, label_, prefix, hash, by_, project, scopes, cap, dailyCap, expiresAt, KeyStatus.Active, now, 0, 0, "", 0);
    var after := create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now);
    assert after.keys == s.keys + [x];
    uniqueP(s);
    forall k | k in after.keys
      ensures ((k.id != "") && (k.label_ != "") && (k.prefix != "") && (k.hash != "") && (k.wallet != "") && (|k.scopes| >= 1) && capOk(k.cap) && capOk(k.dailyCap) && (k.expiresAt >= 0) && (k.createdAt >= 0) && (k.lastUsedAt >= 0) && (k.spent >= 0) && (k.daySpent >= 0) && (k.daySpent <= k.spent) && ((k.lastUsedAt == 0) == (k.dayKey == "")) && (!(k.lastUsedAt != 0) || (k.lastUsedAt >= k.createdAt)))
    {
    }
    assert alwaysKeysAreWellFormed(after);
    uniqueP(after);
    forall k | k in after.keys
      ensures ((|ProofLib.Filter((o: Key) => (o.id == k.id), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.prefix == k.prefix), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.hash == k.hash), after.keys)| == 1))
    {
      ProofLib.FilterAppend((o: Key) => (o.id == k.id), s.keys, x);
      ProofLib.FilterAppend((o: Key) => (o.prefix == k.prefix), s.keys, x);
      ProofLib.FilterAppend((o: Key) => (o.hash == k.hash), s.keys, x);
      if k == x {
        ProofLib.FilterNone((o: Key) => (o.id == k.id), s.keys);
        ProofLib.FilterNone((o: Key) => (o.prefix == k.prefix), s.keys);
        ProofLib.FilterNone((o: Key) => (o.hash == k.hash), s.keys);
      }
    }
    assert alwaysCredentialsAreUnique(after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.wallet == k.wallet)))
    {
      forall a | a in keyWithId(after, k.id)
        ensures a.wallet == k.wallet
      {
        withIdAll(after, k.id);
        assert a in s.keys;
        sameIdIsSame(s, a, k);
      }
    }
    assert stepKeyWalletNeverChanges(s, after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.spent == k.spent) && (a.lastUsedAt == k.lastUsedAt)))
    {
      forall a | a in keyWithId(after, k.id)
        ensures (a.spent == k.spent) && (a.lastUsedAt == k.lastUsedAt)
      {
        withIdAll(after, k.id);
        assert a in s.keys;
        sameIdIsSame(s, a, k);
      }
    }
    assert stepSpendMovesOnlyWithUse(s, "create", after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((((a.lastUsedAt == k.lastUsedAt) && (a.dayKey == k.dayKey)) && (a.daySpent == k.daySpent)) || ("create" == "recordUse")))
    {
      forall a | a in keyWithId(after, k.id)
        ensures ((((a.lastUsedAt == k.lastUsedAt) && (a.dayKey == k.dayKey)) && (a.daySpent == k.daySpent)) || ("create" == "recordUse"))
      {
        withIdAll(after, k.id);
        assert a in s.keys;
        sameIdIsSame(s, a, k);
      }
    }
    assert stepUseMarksUse(s, "create", after);
    forall k | k in s.keys
      ensures ((k.status.Active?) || !(exists a :: a in keyWithId(after, k.id) && !(a.status.Revoked?)))
    {
      if k.status.Revoked? {
        forall a | a in keyWithId(after, k.id)
          ensures a.status.Revoked?
        {
          withIdAll(after, k.id);
          assert a in s.keys;
          sameIdIsSame(s, a, k);
        }
      }
    }
    assert stepRevokedStaysRevoked(s, after);
  }
}

lemma revoke_ensures(s: Keys, by_: string, id: string)
  ensures (inv(s) ==> canRevoke(s, by_, id) ==> alwaysKeysAreWellFormed(revoke(s, by_, id)))
  ensures (inv(s) ==> canRevoke(s, by_, id) ==> alwaysCredentialsAreUnique(revoke(s, by_, id)))
  ensures (inv(s) ==> canRevoke(s, by_, id) ==> stepKeyWalletNeverChanges(s, revoke(s, by_, id)))
  ensures (inv(s) ==> canRevoke(s, by_, id) ==> stepSpendMovesOnlyWithUse(s, "revoke", revoke(s, by_, id)))
  ensures (inv(s) ==> canRevoke(s, by_, id) ==> stepUseMarksUse(s, "revoke", revoke(s, by_, id)))
  ensures (inv(s) ==> canRevoke(s, by_, id) ==> stepRevokedStaysRevoked(s, revoke(s, by_, id)))
{
  if inv(s) && canRevoke(s, by_, id) {
    var after := revoke(s, by_, id);
    uniqueP(s);
    forall i | 0 <= i < |after.keys|
      ensures ((after.keys[i].id != "") && (after.keys[i].label_ != "") && (after.keys[i].prefix != "") && (after.keys[i].hash != "") && (after.keys[i].wallet != "") && (|after.keys[i].scopes| >= 1) && capOk(after.keys[i].cap) && capOk(after.keys[i].dailyCap) && (after.keys[i].expiresAt >= 0) && (after.keys[i].createdAt >= 0) && (after.keys[i].lastUsedAt >= 0) && (after.keys[i].spent >= 0) && (after.keys[i].daySpent >= 0) && (after.keys[i].daySpent <= after.keys[i].spent) && ((after.keys[i].lastUsedAt == 0) == (after.keys[i].dayKey == "")) && (!(after.keys[i].lastUsedAt != 0) || (after.keys[i].lastUsedAt >= after.keys[i].createdAt)))
    {
    }
    assert alwaysKeysAreWellFormed(after);
    uniqueP(after);
    forall i | 0 <= i < |after.keys|
      ensures ((|ProofLib.Filter((o: Key) => (o.id == after.keys[i].id), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.prefix == after.keys[i].prefix), after.keys)| == 1) && (|ProofLib.Filter((o: Key) => (o.hash == after.keys[i].hash), after.keys)| == 1))
    {
      assert after.keys[i].id == s.keys[i].id;
      assert after.keys[i].prefix == s.keys[i].prefix;
      assert after.keys[i].hash == s.keys[i].hash;
      ProofLib.FilterLengthPointwise((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == s.keys[i].id), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.id == s.keys[i].id), (o: Key) => (o.id == after.keys[i].id), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == s.keys[i].prefix), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.prefix == s.keys[i].prefix), (o: Key) => (o.prefix == after.keys[i].prefix), after.keys);
      ProofLib.FilterLengthPointwise((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == s.keys[i].hash), s.keys, after.keys);
      ProofLib.FilterSamePredicate((o: Key) => (o.hash == s.keys[i].hash), (o: Key) => (o.hash == after.keys[i].hash), after.keys);
    }
    assert alwaysCredentialsAreUnique(after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.wallet == k.wallet)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> (after.keys[j].wallet == k.wallet)
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures a.wallet == k.wallet
      {
        withIdAll(after, k.id);
      }
    }
    assert stepKeyWalletNeverChanges(s, after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((a.spent == k.spent) && (a.lastUsedAt == k.lastUsedAt)))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> ((after.keys[j].spent == k.spent) && (after.keys[j].lastUsedAt == k.lastUsedAt))
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures (a.spent == k.spent) && (a.lastUsedAt == k.lastUsedAt)
      {
        withIdAll(after, k.id);
      }
    }
    assert stepSpendMovesOnlyWithUse(s, "revoke", after);
    forall k | k in s.keys
      ensures !(exists a :: a in keyWithId(after, k.id) && !((((a.lastUsedAt == k.lastUsedAt) && (a.dayKey == k.dayKey)) && (a.daySpent == k.daySpent)) || ("revoke" == "recordUse")))
    {
      forall j | 0 <= j < |after.keys|
        ensures (after.keys[j].id == k.id) ==> ((((after.keys[j].lastUsedAt == k.lastUsedAt) && (after.keys[j].dayKey == k.dayKey)) && (after.keys[j].daySpent == k.daySpent)) || ("revoke" == "recordUse"))
      {
        if after.keys[j].id == k.id {
          assert s.keys[j].id == k.id;
          sameIdIsSame(s, s.keys[j], k);
        }
      }
      forall a | a in keyWithId(after, k.id)
        ensures ((((a.lastUsedAt == k.lastUsedAt) && (a.dayKey == k.dayKey)) && (a.daySpent == k.daySpent)) || ("revoke" == "recordUse"))
      {
        withIdAll(after, k.id);
      }
    }
    assert stepUseMarksUse(s, "revoke", after);
    forall k | k in s.keys
      ensures ((k.status.Active?) || !(exists a :: a in keyWithId(after, k.id) && !(a.status.Revoked?)))
    {
      if k.status.Revoked? {
        forall j | 0 <= j < |after.keys|
          ensures (after.keys[j].id == k.id) ==> (after.keys[j].status.Revoked?)
        {
          if after.keys[j].id == k.id {
            assert s.keys[j].id == k.id;
            sameIdIsSame(s, s.keys[j], k);
          }
        }
        forall a | a in keyWithId(after, k.id)
          ensures a.status.Revoked?
        {
          withIdAll(after, k.id);
        }
      }
    }
    assert stepRevokedStaysRevoked(s, after);
  }
}

// spec/app/keys.md, "A revoked key takes no update and no metering": the created key is the
// only one with its id; after revoke it is the only element of keyWithId(after, id).

lemma lawRevokedIsFinal_ensures(s: Keys, by_: string, id: string, label_: string, prefix: string, hash: string, project: string, scopes: seq<string>, cap: int, dailyCap: int, expiresAt: int, now: int, cost: int, day: string)
  ensures (lawRevokedIsFinal(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now, cost, day) == true)
{
  var x := Key(id, label_, prefix, hash, by_, project, scopes, cap, dailyCap, expiresAt, KeyStatus.Active, now, 0, 0, "", 0);
  var mid := create(s, by_, id, label_, prefix, hash, project, scopes, cap, dailyCap, expiresAt, now);
  var after := revoke(mid, by_, id);
  if |keyWithId(s, id)| == 0 {
    assert mid.keys == s.keys + [x];
    withIdIs(s, id);
    ProofLib.FilterNone((k: Key) => (k.id == id), s.keys);
    assert |after.keys| == |s.keys| + 1;
    forall j | 0 <= j < |after.keys|
      ensures (after.keys[j].id == id) ==> after.keys[j].status.Revoked?
    {
      if j == |s.keys| {
        assert after.keys[j] == x.(status := KeyStatus.Revoked);
      }
    }
    forall a | a in keyWithId(after, id)
      ensures a.status.Revoked?
    {
      withIdAll(after, id);
    }
    assert !(exists k :: k in keyWithId(after, id) && !(k.status.Revoked?));
    assert !(exists k :: k in keyWithId(after, id) && (k.status.Active? && (k.project == "")));
    assert !(exists k :: k in keyWithId(after, id) && ((k.status.Active? && (now >= k.createdAt)) && (now >= k.lastUsedAt)));
    ownedKeyWithIdAll(after, id, by_);
    withIdAll(after, id);
    assert !canUpdate(after, by_, id, label_, cap, dailyCap, expiresAt, now);
    assert !canRecordUse(after, by_, id, cost, day, now);
  }
}
