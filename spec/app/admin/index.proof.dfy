lemma lawSuspendLeavesReinstatable_ensures(a: Registry, by_: string, id: string, at: int)
  ensures (lawSuspendLeavesReinstatable(a, by_, id, at) == true)
{
  if canSuspend(a, by_, id) {
    var s := suspend(a, by_, id, at);
    var r :| r in a.records && r.id == id && r.status.Active?;
    var i :| 0 <= i < |a.records| && a.records[i] == r;
    assert s.records[i] == r.(status := Status.Suspended);
    assert s.records[i].id == id && s.records[i].status.Suspended?;
    assert s.records[i] in s.records;
    assert s.ops == a.ops;
    assert isOperator(s, by_);
    assert canReinstate(s, by_, id);
  }
}
