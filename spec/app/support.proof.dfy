// spec/app/support.md, "Every ticket stays well formed and uniquely identified" and the step
// rules: the queue's filters as ProofLib.Filter, so the library's lemmas apply.

lemma findTicketIs(s: Tickets, id: string)
  ensures findTicket(s, id) == ProofLib.Filter((t: Ticket) => (t.id == id), s.tickets)
{
}

lemma findTicketAll(s: Tickets, id: string)
  ensures forall a :: (a in findTicket(s, id)) == (a in s.tickets && (a.id == id))
{
  findTicketIs(s, id);
  forall a ensures (a in findTicket(s, id)) == (a in s.tickets && (a.id == id)) {
    ProofLib.FilterMember((t: Ticket) => (t.id == id), s.tickets, a);
  }
}

lemma wellP(s: Tickets)
  ensures alwaysTicketsAreWellFormed(s) == (!((exists t :: t in s.tickets && !((((((((t.id != "") && (t.email != "")) && (t.topic != "")) && (t.message != "")) && (t.openedAt >= 0)) && (t.updatedAt >= 0)) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0))))))))) && !((exists t :: t in s.tickets && !((|ProofLib.Filter((o: Ticket) => (o.id == t.id), s.tickets)| == 1)))))
{
}

lemma sameIdIsSame(s: Tickets, a: Ticket, b: Ticket)
  requires alwaysTicketsAreWellFormed(s)
  requires a in s.tickets && b in s.tickets && (a.id == b.id)
  ensures a == b
{
  wellP(s);
  ProofLib.FilterMember((o: Ticket) => (o.id == a.id), s.tickets, a);
  ProofLib.FilterMember((o: Ticket) => (o.id == a.id), s.tickets, b);
  assert a == ProofLib.Filter((o: Ticket) => (o.id == a.id), s.tickets)[0];
  assert b == ProofLib.Filter((o: Ticket) => (o.id == a.id), s.tickets)[0];
}

lemma open_ensures(s: Tickets, id: string, email: string, topic: string, message: string, wallet: string, now: int)
  ensures (inv(s) ==> canOpen(s, id, email, topic, message, wallet, now) ==> alwaysTicketsAreWellFormed(open(s, id, email, topic, message, wallet, now)))
  ensures (inv(s) ==> canOpen(s, id, email, topic, message, wallet, now) ==> stepCustomerReplyReopens(s, "open", open(s, id, email, topic, message, wallet, now)))
  ensures (inv(s) ==> canOpen(s, id, email, topic, message, wallet, now) ==> stepStaffReplyProgresses(s, "open", open(s, id, email, topic, message, wallet, now)))
  ensures (inv(s) ==> canOpen(s, id, email, topic, message, wallet, now) ==> stepRepliesOnlyGrow(s, open(s, id, email, topic, message, wallet, now)))
  ensures (inv(s) ==> canOpen(s, id, email, topic, message, wallet, now) ==> stepStatesMoveByListedTransitions(s, "open", open(s, id, email, topic, message, wallet, now)))
{
  if inv(s) && canOpen(s, id, email, topic, message, wallet, now) {
    var x := Ticket(id, email, topic, message, TicketState.Open, now, now, "", wallet, []);
    var after := open(s, id, email, topic, message, wallet, now);
    assert after.tickets == s.tickets + [x];
    wellP(s);
    forall t | t in after.tickets
      ensures (((t.id != "") && (t.email != "") && (t.topic != "") && (t.message != "") && (t.openedAt >= 0) && (t.updatedAt >= 0) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0)))))))
    {
    }
    assert !(exists t :: t in after.tickets && !((((((((t.id != "") && (t.email != "")) && (t.topic != "")) && (t.message != "")) && (t.openedAt >= 0)) && (t.updatedAt >= 0)) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0))))))));
    forall t | t in after.tickets
      ensures (|ProofLib.Filter((o: Ticket) => (o.id == t.id), after.tickets)| == 1)
    {
      ProofLib.FilterAppend((o: Ticket) => (o.id == t.id), s.tickets, x);
      if t == x {
        ProofLib.FilterNone((o: Ticket) => (o.id == t.id), s.tickets);
      } else {
        assert t in s.tickets;
      }
    }
    assert !(exists t :: t in after.tickets && !((|ProofLib.Filter((o: Ticket) => (o.id == t.id), after.tickets)| == 1)));
    wellP(after);
    assert alwaysTicketsAreWellFormed(after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))))
    {
      forall a | a in findTicket(after, t.id)
        ensures ((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))
      {
        findTicketAll(after, t.id);
        assert a in s.tickets;
        sameIdIsSame(s, a, t);
      }
    }
    assert stepRepliesOnlyGrow(s, after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((((a.state == t.state) || ("open" == "reply")) || ("open" == "staffReply")) || ("open" == "setState"))))
    {
      forall a | a in findTicket(after, t.id)
        ensures ((((a.state == t.state) || ("open" == "reply")) || ("open" == "staffReply")) || ("open" == "setState"))
      {
        findTicketAll(after, t.id);
        assert a in s.tickets;
        sameIdIsSame(s, a, t);
      }
    }
    assert stepStatesMoveByListedTransitions(s, "open", after);
  }
}

lemma reply_ensures(s: Tickets, id: string, body: string, now: int)
  ensures (inv(s) ==> canReply(s, id, body, now) ==> alwaysTicketsAreWellFormed(reply(s, id, body, now)))
  ensures (inv(s) ==> canReply(s, id, body, now) ==> stepCustomerReplyReopens(s, "reply", reply(s, id, body, now)))
  ensures (inv(s) ==> canReply(s, id, body, now) ==> stepStaffReplyProgresses(s, "reply", reply(s, id, body, now)))
  ensures (inv(s) ==> canReply(s, id, body, now) ==> stepRepliesOnlyGrow(s, reply(s, id, body, now)))
  ensures (inv(s) ==> canReply(s, id, body, now) ==> stepStatesMoveByListedTransitions(s, "reply", reply(s, id, body, now)))
{
  if inv(s) && canReply(s, id, body, now) {
    var after := reply(s, id, body, now);
    wellP(s);
    forall i | 0 <= i < |after.tickets|
      ensures ((after.tickets[i].id != "") && (after.tickets[i].email != "") && (after.tickets[i].topic != "") && (after.tickets[i].message != "") && (after.tickets[i].openedAt >= 0) && (after.tickets[i].updatedAt >= 0) && !((exists r :: r in after.tickets[i].replies && !(((r.body != "") && (r.time >= 0))))))
    {
    }
    assert !(exists t :: t in after.tickets && !((((((((t.id != "") && (t.email != "")) && (t.topic != "")) && (t.message != "")) && (t.openedAt >= 0)) && (t.updatedAt >= 0)) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0))))))));
    forall i | 0 <= i < |after.tickets|
      ensures (|ProofLib.Filter((o: Ticket) => (o.id == after.tickets[i].id), after.tickets)| == 1)
    {
      assert after.tickets[i].id == s.tickets[i].id;
      ProofLib.FilterLengthPointwise((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == s.tickets[i].id), s.tickets, after.tickets);
      ProofLib.FilterSamePredicate((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == after.tickets[i].id), after.tickets);
    }
    assert !(exists t :: t in after.tickets && !((|ProofLib.Filter((o: Ticket) => (o.id == t.id), after.tickets)| == 1)));
    wellP(after);
    assert alwaysTicketsAreWellFormed(after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((a.state == t.state) || (t.state.Resolved? && a.state.Open?))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> ((after.tickets[j].state == t.state) || (t.state.Resolved? && after.tickets[j].state.Open?))
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((a.state == t.state) || (t.state.Resolved? && a.state.Open?))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepCustomerReplyReopens(s, "reply", after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> ((|after.tickets[j].replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in after.tickets[j].replies)))))
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepRepliesOnlyGrow(s, after);
  }
}

lemma staffReply_ensures(s: Tickets, id: string, body: string, visibility: Visibility, author: string, now: int)
  ensures (inv(s) ==> canStaffReply(s, id, body, visibility, author, now) ==> alwaysTicketsAreWellFormed(staffReply(s, id, body, visibility, author, now)))
  ensures (inv(s) ==> canStaffReply(s, id, body, visibility, author, now) ==> stepCustomerReplyReopens(s, "staffReply", staffReply(s, id, body, visibility, author, now)))
  ensures (inv(s) ==> canStaffReply(s, id, body, visibility, author, now) ==> stepStaffReplyProgresses(s, "staffReply", staffReply(s, id, body, visibility, author, now)))
  ensures (inv(s) ==> canStaffReply(s, id, body, visibility, author, now) ==> stepRepliesOnlyGrow(s, staffReply(s, id, body, visibility, author, now)))
  ensures (inv(s) ==> canStaffReply(s, id, body, visibility, author, now) ==> stepStatesMoveByListedTransitions(s, "staffReply", staffReply(s, id, body, visibility, author, now)))
{
  if inv(s) && canStaffReply(s, id, body, visibility, author, now) {
    var after := staffReply(s, id, body, visibility, author, now);
    wellP(s);
    forall i | 0 <= i < |after.tickets|
      ensures ((after.tickets[i].id != "") && (after.tickets[i].email != "") && (after.tickets[i].topic != "") && (after.tickets[i].message != "") && (after.tickets[i].openedAt >= 0) && (after.tickets[i].updatedAt >= 0) && !((exists r :: r in after.tickets[i].replies && !(((r.body != "") && (r.time >= 0))))))
    {
    }
    assert !(exists t :: t in after.tickets && !((((((((t.id != "") && (t.email != "")) && (t.topic != "")) && (t.message != "")) && (t.openedAt >= 0)) && (t.updatedAt >= 0)) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0))))))));
    forall i | 0 <= i < |after.tickets|
      ensures (|ProofLib.Filter((o: Ticket) => (o.id == after.tickets[i].id), after.tickets)| == 1)
    {
      assert after.tickets[i].id == s.tickets[i].id;
      ProofLib.FilterLengthPointwise((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == s.tickets[i].id), s.tickets, after.tickets);
      ProofLib.FilterSamePredicate((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == after.tickets[i].id), after.tickets);
    }
    assert !(exists t :: t in after.tickets && !((|ProofLib.Filter((o: Ticket) => (o.id == t.id), after.tickets)| == 1)));
    wellP(after);
    assert alwaysTicketsAreWellFormed(after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((a.state == t.state) || (t.state.Open? && a.state.InProgress?))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> ((after.tickets[j].state == t.state) || (t.state.Open? && after.tickets[j].state.InProgress?))
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((a.state == t.state) || (t.state.Open? && a.state.InProgress?))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepStaffReplyProgresses(s, "staffReply", after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> ((|after.tickets[j].replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in after.tickets[j].replies)))))
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepRepliesOnlyGrow(s, after);
  }
}

lemma setState_ensures(s: Tickets, id: string, status: TicketState, now: int)
  ensures (inv(s) ==> canSetState(s, id, status, now) ==> alwaysTicketsAreWellFormed(setState(s, id, status, now)))
  ensures (inv(s) ==> canSetState(s, id, status, now) ==> stepCustomerReplyReopens(s, "setState", setState(s, id, status, now)))
  ensures (inv(s) ==> canSetState(s, id, status, now) ==> stepStaffReplyProgresses(s, "setState", setState(s, id, status, now)))
  ensures (inv(s) ==> canSetState(s, id, status, now) ==> stepRepliesOnlyGrow(s, setState(s, id, status, now)))
  ensures (inv(s) ==> canSetState(s, id, status, now) ==> stepStatesMoveByListedTransitions(s, "setState", setState(s, id, status, now)))
{
  if inv(s) && canSetState(s, id, status, now) {
    var after := setState(s, id, status, now);
    wellP(s);
    forall i | 0 <= i < |after.tickets|
      ensures ((after.tickets[i].id != "") && (after.tickets[i].email != "") && (after.tickets[i].topic != "") && (after.tickets[i].message != "") && (after.tickets[i].openedAt >= 0) && (after.tickets[i].updatedAt >= 0) && !((exists r :: r in after.tickets[i].replies && !(((r.body != "") && (r.time >= 0))))))
    {
    }
    assert !(exists t :: t in after.tickets && !((((((((t.id != "") && (t.email != "")) && (t.topic != "")) && (t.message != "")) && (t.openedAt >= 0)) && (t.updatedAt >= 0)) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0))))))));
    forall i | 0 <= i < |after.tickets|
      ensures (|ProofLib.Filter((o: Ticket) => (o.id == after.tickets[i].id), after.tickets)| == 1)
    {
      assert after.tickets[i].id == s.tickets[i].id;
      ProofLib.FilterLengthPointwise((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == s.tickets[i].id), s.tickets, after.tickets);
      ProofLib.FilterSamePredicate((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == after.tickets[i].id), after.tickets);
    }
    assert !(exists t :: t in after.tickets && !((|ProofLib.Filter((o: Ticket) => (o.id == t.id), after.tickets)| == 1)));
    wellP(after);
    assert alwaysTicketsAreWellFormed(after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> ((|after.tickets[j].replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in after.tickets[j].replies)))))
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepRepliesOnlyGrow(s, after);
  }
}

lemma assignOwner_ensures(s: Tickets, id: string, wallet: string, now: int)
  ensures (inv(s) ==> canAssignOwner(s, id, wallet, now) ==> alwaysTicketsAreWellFormed(assignOwner(s, id, wallet, now)))
  ensures (inv(s) ==> canAssignOwner(s, id, wallet, now) ==> stepCustomerReplyReopens(s, "assignOwner", assignOwner(s, id, wallet, now)))
  ensures (inv(s) ==> canAssignOwner(s, id, wallet, now) ==> stepStaffReplyProgresses(s, "assignOwner", assignOwner(s, id, wallet, now)))
  ensures (inv(s) ==> canAssignOwner(s, id, wallet, now) ==> stepRepliesOnlyGrow(s, assignOwner(s, id, wallet, now)))
  ensures (inv(s) ==> canAssignOwner(s, id, wallet, now) ==> stepStatesMoveByListedTransitions(s, "assignOwner", assignOwner(s, id, wallet, now)))
{
  if inv(s) && canAssignOwner(s, id, wallet, now) {
    var after := assignOwner(s, id, wallet, now);
    wellP(s);
    forall i | 0 <= i < |after.tickets|
      ensures ((after.tickets[i].id != "") && (after.tickets[i].email != "") && (after.tickets[i].topic != "") && (after.tickets[i].message != "") && (after.tickets[i].openedAt >= 0) && (after.tickets[i].updatedAt >= 0) && !((exists r :: r in after.tickets[i].replies && !(((r.body != "") && (r.time >= 0))))))
    {
    }
    assert !(exists t :: t in after.tickets && !((((((((t.id != "") && (t.email != "")) && (t.topic != "")) && (t.message != "")) && (t.openedAt >= 0)) && (t.updatedAt >= 0)) && !((exists r :: r in t.replies && !(((r.body != "") && (r.time >= 0))))))));
    forall i | 0 <= i < |after.tickets|
      ensures (|ProofLib.Filter((o: Ticket) => (o.id == after.tickets[i].id), after.tickets)| == 1)
    {
      assert after.tickets[i].id == s.tickets[i].id;
      ProofLib.FilterLengthPointwise((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == s.tickets[i].id), s.tickets, after.tickets);
      ProofLib.FilterSamePredicate((o: Ticket) => (o.id == s.tickets[i].id), (o: Ticket) => (o.id == after.tickets[i].id), after.tickets);
    }
    assert !(exists t :: t in after.tickets && !((|ProofLib.Filter((o: Ticket) => (o.id == t.id), after.tickets)| == 1)));
    wellP(after);
    assert alwaysTicketsAreWellFormed(after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> ((|after.tickets[j].replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in after.tickets[j].replies)))))
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((|a.replies| >= |t.replies|) && !((exists r :: r in t.replies && !((r in a.replies)))))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepRepliesOnlyGrow(s, after);
    forall t | t in s.tickets
      ensures !(exists a :: a in findTicket(after, t.id) && !(((((a.state == t.state) || ("assignOwner" == "reply")) || ("assignOwner" == "staffReply")) || ("assignOwner" == "setState"))))
    {
      forall j | 0 <= j < |after.tickets|
        ensures (after.tickets[j].id == t.id) ==> (after.tickets[j].state == t.state)
      {
        if after.tickets[j].id == t.id {
          assert s.tickets[j].id == t.id;
          sameIdIsSame(s, s.tickets[j], t);
        }
      }
      forall a | a in findTicket(after, t.id)
        ensures ((((a.state == t.state) || ("assignOwner" == "reply")) || ("assignOwner" == "staffReply")) || ("assignOwner" == "setState"))
      {
        findTicketAll(after, t.id);
      }
    }
    assert stepStatesMoveByListedTransitions(s, "assignOwner", after);
  }
}

// spec/app/support.md, "The lifecycle as the customer and the team run it": the opened ticket
// is the only one with its id; each map only touches that last element.

lemma lawCustomerReplyReopensResolved_ensures(s: Tickets, id: string, email: string, topic: string, message: string, wallet: string, now: int, body: string)
  ensures (lawCustomerReplyReopensResolved(s, id, email, topic, message, wallet, now, body) == true)
{
  var x := Ticket(id, email, topic, message, TicketState.Open, now, now, "", wallet, []);
  var t1 := open(s, id, email, topic, message, wallet, now);
  var t2 := setState(t1, id, TicketState.Resolved, now);
  var t3 := reply(t2, id, body, now);
  if |findTicket(s, id)| == 0 {
    assert t1.tickets == s.tickets + [x];
    findTicketIs(s, id);
    ProofLib.FilterNone((t: Ticket) => (t.id == id), s.tickets);
    assert |t3.tickets| == |s.tickets| + 1;
    forall a | a in findTicket(t3, id)
      ensures a.state.Open?
    {
      findTicketAll(t3, id);
      var j :| 0 <= j < |t3.tickets| && t3.tickets[j] == a;
      if j < |s.tickets| {
        assert t2.tickets[j].id == t1.tickets[j].id;
        assert s.tickets[j].id == id;
        assert false;
      }
    }
    assert !(exists t :: t in findTicket(t3, id) && !(t.state.Open?));
  }
}

lemma lawStaffReplyStartsProgress_ensures(s: Tickets, id: string, email: string, topic: string, message: string, wallet: string, now: int, body: string, visibility: Visibility, author: string)
  ensures (lawStaffReplyStartsProgress(s, id, email, topic, message, wallet, now, body, visibility, author) == true)
{
  var x := Ticket(id, email, topic, message, TicketState.Open, now, now, "", wallet, []);
  var t1 := open(s, id, email, topic, message, wallet, now);
  var t2 := staffReply(t1, id, body, visibility, author, now);
  if |findTicket(s, id)| == 0 {
    assert t1.tickets == s.tickets + [x];
    findTicketIs(s, id);
    ProofLib.FilterNone((t: Ticket) => (t.id == id), s.tickets);
    assert |t2.tickets| == |s.tickets| + 1;
    forall a | a in findTicket(t2, id)
      ensures a.state.InProgress?
    {
      findTicketAll(t2, id);
      var j :| 0 <= j < |t2.tickets| && t2.tickets[j] == a;
      if j < |s.tickets| {
        assert t1.tickets[j].id == s.tickets[j].id;
        assert s.tickets[j].id == id;
        assert false;
      }
    }
    assert !(exists t :: t in findTicket(t2, id) && !(t.state.InProgress?));
  }
}
