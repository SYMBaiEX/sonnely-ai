// spec/app/admin/operators.md "A revoke removes exactly that wallet":
// ProofLib.Filter restates the rule's Std.Collections.Seq.Filter.
lemma OnceEachBridge(roster: seq<Operator>)
  ensures onceEach(roster) == !(exists o :: o in roster && !(|ProofLib.Filter((x: Operator) => (x.wallet == o.wallet), roster)| == 1))
{
}

lemma PartitionTwo<T>(p: T -> bool, q: T -> bool, xs: seq<T>)
  requires forall i :: 0 <= i < |xs| ==> p(xs[i]) != q(xs[i])
  ensures |ProofLib.Filter(p, xs)| + |ProofLib.Filter(q, xs)| == |xs|
  decreases |xs|
{
  if |xs| > 0 {
    ProofLib.FilterCons(p, xs);
    ProofLib.FilterCons(q, xs);
    PartitionTwo(p, q, xs[1..]);
  }
}

lemma RevokeRoster(d: Directory, by_: string, wallet: string)
  ensures revoke(d, by_, wallet).roster == ProofLib.Filter((o: Operator) => (o.wallet != wallet), d.roster)
{
}

lemma RevokeRemoves(d: Directory, by_: string, wallet: string)
  requires canRevoke(d, by_, wallet) && onceEach(d.roster)
  ensures !isOperator(revoke(d, by_, wallet), wallet)
  ensures |revoke(d, by_, wallet).roster| == |d.roster| - 1
{
  OnceEachBridge(d.roster);
  var o :| o in d.roster && o.wallet == wallet;
  var i :| 0 <= i < |d.roster| && d.roster[i] == o;
  assert |ProofLib.Filter((x: Operator) => (x.wallet == o.wallet), d.roster)| == 1;
  forall j | 0 <= j < |d.roster| && j != i
    ensures d.roster[j].wallet != wallet
  {
    if d.roster[j].wallet == wallet {
      ProofLib.FilterTwo((x: Operator) => (x.wallet == o.wallet), d.roster, i, j);
    }
  }
  ProofLib.FilterOne((x: Operator) => (x.wallet == wallet), d.roster, i);
  PartitionTwo((x: Operator) => (x.wallet == wallet), (o: Operator) => (o.wallet != wallet), d.roster);
  RevokeRoster(d, by_, wallet);
  forall o2 | o2 in revoke(d, by_, wallet).roster
    ensures o2.wallet != wallet
  {
    ProofLib.FilterMember((o: Operator) => (o.wallet != wallet), d.roster, o2);
  }
}

lemma lawRevokeRemovesTheWallet_ensures(d: Directory, by_: string, wallet: string)
  ensures (lawRevokeRemovesTheWallet(d, by_, wallet) == true)
{
  if canRevoke(d, by_, wallet) && onceEach(d.roster) {
    RevokeRemoves(d, by_, wallet);
  }
}

// spec/app/admin/operators.md "Granting keeps each wallet listed once":
// the map keeps wallets, so the filtered counts carry over pointwise.
lemma GrantPreservesOnceEach(d: Directory, by_: string, wallet: string, role: Role)
  requires canGrant(d, by_, wallet, role) && onceEach(d.roster)
  ensures onceEach(grant(d, by_, wallet, role).roster)
{
  var result := grant(d, by_, wallet, role).roster;
  OnceEachBridge(d.roster);
  forall o | o in result
    ensures |ProofLib.Filter((x: Operator) => (x.wallet == o.wallet), result)| == 1
  {
    if isOperator(d, wallet) {
      var i :| 0 <= i < |result| && result[i] == o;
      assert result[i].wallet == d.roster[i].wallet;
      assert d.roster[i] in d.roster;
      assert |ProofLib.Filter((x: Operator) => (x.wallet == d.roster[i].wallet), d.roster)| == 1;
      ProofLib.FilterLengthPointwise((x: Operator) => (x.wallet == d.roster[i].wallet), (x: Operator) => (x.wallet == o.wallet), d.roster, result);
    } else {
      if o.wallet == wallet {
        assert forall i :: 0 <= i < |d.roster| ==> d.roster[i].wallet != wallet;
        ProofLib.FilterNone((x: Operator) => (x.wallet == o.wallet), d.roster);
        ProofLib.FilterAppend((x: Operator) => (x.wallet == o.wallet), d.roster, Operator(wallet, role));
      } else {
        var i :| 0 <= i < |d.roster| && d.roster[i] == o;
        assert |ProofLib.Filter((x: Operator) => (x.wallet == o.wallet), d.roster)| == 1;
        assert Operator(wallet, role).wallet != o.wallet;
        ProofLib.FilterAppend((x: Operator) => (x.wallet == o.wallet), d.roster, Operator(wallet, role));
      }
    }
  }
  OnceEachBridge(result);
}

lemma lawGrantKeepsEachWalletOnce_ensures(d: Directory, by_: string, wallet: string, role: Role)
  ensures (lawGrantKeepsEachWalletOnce(d, by_, wallet, role) == true)
{
  if canGrant(d, by_, wallet, role) && onceEach(d.roster) {
    GrantPreservesOnceEach(d, by_, wallet, role);
  }
}
