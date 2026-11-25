# Support

A support request is a thread between a workspace and the team: the customer
opens it with an email, a topic and a message, and either side replies in the
open. Its state is `open`, `in_progress` or `resolved` (the legacy labels):
a staff reply on an open request moves it to `in_progress`, the customer
replying on a resolved request reopens it to `open`, and staff set the state
directly. Replies are `public` — shown to the customer — or `internal`,
staff notes only.

## Domain

### A ticket and its replies

Each field is nonempty; the product limits an email to 254 characters, a
topic to 60, a message to 3,000 and a reply body to 4,000.

```quint
type TicketState = Open | InProgress | Resolved

type Author = Customer | Staff

type Visibility = Public | Internal

type Reply = { author: Author, visibility: Visibility, body: str, time: int }

type Ticket = {
  id: str,
  email: str,
  topic: str,
  message: str,
  state: TicketState,
  openedAt: int,
  updatedAt: int,
  replies: List[Reply],
}

type Tickets = { tickets: List[Ticket] }
```

### The queue starts empty

```quint
pure val initial: Tickets = { tickets: List() }
```

```quint
pure def findTicket(s: Tickets, id: str): List[Ticket] = s.tickets.select(t => t.id == id)

pure val idValues = Set("t1", "t2", "t3")
pure val emailValues = Set("ada@example.com", "grace@example.com")
pure val topicValues = Set("Workspace support", "Billing", "Product feedback", "Infrastructure partnership")
pure val messageValues = Set("How can we help?", "My request")
pure val bodyValues = Set("More details", "Thanks")
pure val nowValues = Set(0, 1000, 5000)
pure val visibilityValues = Set(Public, Internal)
pure val statusValues = Set(Open, InProgress, Resolved)
```

## Story: Open a request

> As a workspace member, I want to open a support request with my email, a
> topic and a message, so that the team can answer me in a thread I can
> follow.

### A request needs valid fields and a fresh id

```quint
pure def canOpen(s: Tickets, id: str, email: str, topic: str, message: str, now: int): bool =
  id != "" and email != "" and topic != "" and message != ""
  and now >= 0
  and s.tickets.every(t => t.id != id)

pure def open(s: Tickets, id: str, email: str, topic: str, message: str, now: int): Tickets =
  { tickets: s.tickets.append({
      id: id, email: email, topic: topic, message: message,
      state: Open, openedAt: now, updatedAt: now, replies: List() }) }
```

### Every ticket stays well formed and uniquely identified

```quint
pure def alwaysTicketsAreWellFormed(s: Tickets): bool =
  s.tickets.every(t =>
    t.id != "" and t.email != "" and t.topic != "" and t.message != ""
    and t.openedAt >= 0 and t.updatedAt >= 0
    and t.replies.every(r => r.body != "" and r.time >= 0))
  and s.tickets.every(t => s.tickets.select(o => o.id == t.id).length() == 1)
```

### A request can be opened

```quint
pure def sometimesOpen(s: Tickets): bool = s.tickets.some(t => t.state == Open)
```

## Story: Converse on a request

> As a workspace member, I want to reply on my request and read the team's
> public replies, so that we can work the problem together.

### The customer can reply on their request

A reply is nonempty — the product allows up to 4,000 characters; replying on
a resolved request reopens it.

```quint
pure def canReply(s: Tickets, id: str, body: str, now: int): bool =
  body != "" and now >= 0
  and findTicket(s, id).length() == 1

pure def reply(s: Tickets, id: str, body: str, now: int): Tickets =
  { tickets: s.tickets.listMap(t =>
      if (t.id == id)
        { ...t, updatedAt: now,
                state: if (t.state == Resolved) Open else t.state,
                replies: t.replies.append({ author: Customer, visibility: Public, body: body, time: now }) }
      else t) }
```

### The team can reply publicly or note internally

A public reply — nonempty, like the customer's — is what the customer sees
of the team's side; an internal note stays with staff. A staff reply on an open request starts progress.

```quint
pure def canStaffReply(s: Tickets, id: str, body: str, visibility: Visibility, now: int): bool =
  body != "" and now >= 0
  and findTicket(s, id).length() == 1

pure def staffReply(s: Tickets, id: str, body: str, visibility: Visibility, now: int): Tickets =
  { tickets: s.tickets.listMap(t =>
      if (t.id == id)
        { ...t, updatedAt: now,
                state: if (t.state == Open) InProgress else t.state,
                replies: t.replies.append({ author: Staff, visibility: visibility, body: body, time: now }) }
      else t) }
```

### Replying reopens a resolved request

```quint
pure def stepCustomerReplyReopens(before: Tickets, via: str, after: Tickets): bool =
  via != "reply"
  or before.tickets.every(t =>
       findTicket(after, t.id).every(a =>
         a.state == t.state or (t.state == Resolved and a.state == Open)))
```

### A staff reply starts progress on an open request

```quint
pure def stepStaffReplyProgresses(before: Tickets, via: str, after: Tickets): bool =
  via != "staffReply"
  or before.tickets.every(t =>
       findTicket(after, t.id).every(a =>
         a.state == t.state or (t.state == Open and a.state == InProgress)))
```

### Replies are never removed

```quint
pure def stepRepliesOnlyGrow(before: Tickets, after: Tickets): bool =
  before.tickets.every(t =>
    findTicket(after, t.id).every(a =>
      a.replies.length() >= t.replies.length() and t.replies.every(r => a.replies.includes(r))))
```

### A thread can hold a public reply from the team

```quint
pure def sometimesAnswered(s: Tickets): bool =
  s.tickets.some(t => t.replies.some(r => r.author == Staff and r.visibility == Public))
```

## Story: Move a request through its states

> As a support operator, I want to set a request's state, so that open,
> in progress and resolved mean what the customer sees.

### Staff set the state directly

```quint
pure def canSetState(s: Tickets, id: str, status: TicketState, now: int): bool =
  now >= 0 and findTicket(s, id).length() == 1

pure def setState(s: Tickets, id: str, status: TicketState, now: int): Tickets =
  { tickets: s.tickets.listMap(t => if (t.id == id) { ...t, state: status, updatedAt: now } else t) }
```

### Only the listed transitions move a request's state

```quint
pure def stepStatesMoveByListedTransitions(before: Tickets, via: str, after: Tickets): bool =
  before.tickets.every(t =>
    findTicket(after, t.id).every(a =>
      a.state == t.state or via == "reply" or via == "staffReply" or via == "setState"))
```

### A request can be resolved

```quint
pure def sometimesResolved(s: Tickets): bool = s.tickets.some(t => t.state == Resolved)
```

### The lifecycle as the customer and the team run it

```quint
pure def lawCustomerReplyReopensResolved(s: Tickets, id: str, email: str, topic: str, message: str, now: int, body: str): bool =
  val t1 = open(s, id, email, topic, message, now)
  val t2 = setState(t1, id, Resolved, now)
  val t3 = reply(t2, id, body, now)
  findTicket(s, id).length() != 0 or findTicket(t3, id).every(t => t.state == Open)

pure def lawStaffReplyStartsProgress(s: Tickets, id: str, email: str, topic: str, message: str, now: int, body: str, visibility: Visibility): bool =
  val t1 = open(s, id, email, topic, message, now)
  val t2 = staffReply(t1, id, body, visibility, now)
  findTicket(s, id).length() != 0 or findTicket(t2, id).every(t => t.state == InProgress)
```
