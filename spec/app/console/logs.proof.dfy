// spec/app/console/logs.md, "Story: Review request activity": proofs for the
// logs machine's rules.

// spec/app/console/logs.md, "Request ids are never repeated": the rule reads
// with the heap-free filter.
lemma UniqueP(l: Logs)
  ensures alwaysRequestIdsUnique(l) == !((exists e :: e in l.entries && !((|ProofLib.Filter((x: LogEntry) => (x.id == e.id), l.entries)| == 1))))
{
}

// spec/app/console/logs.md, "Served requests are recorded newest first": the
// prepended entry keeps every request id unique when the guard passed.
lemma record_ensures(l: Logs, entry: LogEntry)
  ensures (inv(l) ==> canRecord(l, entry) ==> alwaysRequestIdsUnique(record(l, entry)))
  ensures (inv(l) ==> canRecord(l, entry) ==> stepNeverLosesHistory(l, "record", record(l, entry)))
{
  if inv(l) && canRecord(l, entry) {
    var after := record(l, entry);
    assert after.entries == [entry] + l.entries;
    assert |after.entries| == |l.entries| + 1;
    UniqueP(l);
    UniqueP(after);
    forall e | e in after.entries
      ensures |ProofLib.Filter((x: LogEntry) => (x.id == e.id), after.entries)| == 1
    {
      var i :| 0 <= i < |after.entries| && after.entries[i] == e;
      ProofLib.FilterCons((x: LogEntry) => (x.id == e.id), after.entries);
      assert after.entries[1..] == l.entries;
      if i == 0 {
        assert e == entry;
        assert |ProofLib.Filter((x: LogEntry) => (x.id == entry.id), l.entries)| == 0;
        ProofLib.FilterSamePredicate((x: LogEntry) => (x.id == e.id), (x: LogEntry) => (x.id == entry.id), l.entries);
        assert ProofLib.Filter((x: LogEntry) => (x.id == e.id), l.entries) == [];
      } else {
        assert e == l.entries[i - 1] && e in l.entries;
        if entry.id == e.id {
          assert |ProofLib.Filter((x: LogEntry) => (x.id == entry.id), l.entries)| == 0;
          ProofLib.FilterMember((x: LogEntry) => (x.id == entry.id), l.entries, e);
          assert false;
        }
        assert |ProofLib.Filter((x: LogEntry) => (x.id == e.id), l.entries)| == 1;
      }
    }
    assert !(exists e :: e in after.entries && !(|ProofLib.Filter((x: LogEntry) => (x.id == e.id), after.entries)| == 1));
  }
}

// spec/app/console/logs.md, "The workspace opens with a sample history": the
// three starter rows have distinct request ids.
lemma initialHolds_ensures()
  ensures inv(initialHolds())
{
  var l := initialHolds();
  assert l == initial;
  UniqueP(l);
  forall e | e in l.entries
    ensures |ProofLib.Filter((x: LogEntry) => (x.id == e.id), l.entries)| == 1
  {
    assert e == l.entries[0] || e == l.entries[1] || e == l.entries[2];
    ProofLib.FilterCons((x: LogEntry) => (x.id == e.id), l.entries);
    ProofLib.FilterCons((x: LogEntry) => (x.id == e.id), l.entries[1..]);
    ProofLib.FilterCons((x: LogEntry) => (x.id == e.id), l.entries[1..][1..]);
    ProofLib.FilterNil((x: LogEntry) => (x.id == e.id), l.entries[1..][1..][1..]);
  }
  assert !(exists e :: e in l.entries && !(|ProofLib.Filter((x: LogEntry) => (x.id == e.id), l.entries)| == 1));
}
