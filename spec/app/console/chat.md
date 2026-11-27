# Chat

The playground: conversations of user prompts and assistant answers on a
chosen model. The console keeps the thread history; what answers a prompt
belongs to the responder behind the shell — on staging a deterministic
local responder, in production the inference gateway. An assistant reply
arrives in pieces: each `reply` event carries the answer so far, so an
answer in progress is replaced, not appended.

## Domain

### A conversation is an alternating run of user and assistant messages

Each message records its role, its text and the model it ran on. A thread
has an id and the model its next turn runs on.

```quint
type Role = User | Assistant

type Message = { role: Role, content: str, model: str }

type Thread = { id: str, model: str, messages: List[Message] }
```

### The playground is the threads, the open one and the chosen model

`active` names the open thread, or no thread while a new conversation is
composed. `model` is the model the next message will run on.

```quint
type Chat = { threads: List[Thread], active: str, model: str }

pure val initial: Chat = { threads: List(), active: "", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }
```

```quint
pure def thread(c: Chat, id: str): List[Thread] = c.threads.select((t) => t.id == id)

pure def replaceThread(threads: List[Thread], id: str, fresh: Thread): List[Thread] =
  threads.foldl(List(), (acc, t) => acc.concat(List(if (t.id == id) fresh else t)))

pure def lastMessage(t: Thread): Message =
  t.messages.nthOr(t.messages.length() - 1, { role: User, content: "", model: t.model })

type TakeAcc = { out: List[Message], i: int }

pure def takeMessages(xs: List[Message], n: int): List[Message] =
  xs.foldl({ out: List(), i: 0 }, (acc, m) =>
    if (acc.i < n) { out: acc.out.concat(List(m)), i: acc.i + 1 }
    else { out: acc.out, i: acc.i + 1 }).out

type AltAcc = { ok: bool, prev: Message }
```

## Story: Converse with a model

> As a user, I want to ask a model questions in threads I can reopen, so
> that I can try the inference API before I wire it up.

### A new conversation starts with no thread open

```quint
pure def newChat(c: Chat): Chat = { ...c, active: "" }
```

### Choosing a model picks what the next message runs on

```quint
pure def canPickModel(c: Chat, model: str): bool = model != "" and model != c.model

pure def pickModel(c: Chat, model: str): Chat = { ...c, model: model }
```

### Sending takes one turn at a time

A send opens a new thread or continues one. When the thread's last message
is an assistant answer, the send adds a new user turn after it. When the
user turn is still waiting on an answer — the answer is streaming, or it
never arrived because the stream died or the tab closed — the send re-asks
instead: it replaces the waiting question rather than stacking a second
user turn behind it, so a question the model never answered can never
wedge the thread.

```quint
pure def canSend(c: Chat, id: str, model: str, text: str): bool =
  text != "" and model != ""

pure def send(c: Chat, id: str, model: str, text: str): Chat =
  val ts = thread(c, id)
  val t = ts.nthOr(0, { id: id, model: model, messages: List() })
  val messages =
    if (ts.length() > 0 and t.messages.length() > 0 and lastMessage(t).role == User)
      t.messages.removeAt(t.messages.length() - 1).concat(List({ role: User, content: text, model: model }))
    else t.messages.concat(List({ role: User, content: text, model: model }))
  if (ts.length() == 0)
    {
      threads: List({ id: id, model: model, messages: List({ role: User, content: text, model: model }) }).concat(c.threads),
      active: id,
      model: model,
    }
  else
    {
      threads: List({ ...t, model: model, messages: messages }).concat(c.threads.select((x) => x.id != id)),
      active: id,
      model: model,
    }
```

### The responder answers or extends an answer in progress

A reply follows the last user message with an assistant message, or
replaces the answer text of the assistant message already there — a chunk
of the answer arriving, or the answer regenerated.

```quint
pure def canReply(c: Chat, id: str): bool =
  val ts = thread(c, id)
  ts.length() > 0 and ts.head().messages.length() > 0

pure def reply(c: Chat, id: str, model: str, text: str): Chat =
  val ts = thread(c, id)
  val t = ts.nthOr(0, { id: id, model: model, messages: List() })
  val latest = lastMessage(t)
  val messages =
    if (latest.role == Assistant) t.messages.removeAt(t.messages.length() - 1).concat(List({ ...latest, content: text }))
    else t.messages.concat(List({ role: Assistant, content: text, model: model }))
  if (ts.length() == 0) c
  else { ...c, threads: replaceThread(c.threads, id, { ...t, messages: messages }) }
```

### A thread can be reopened and forgotten

Opening a thread shows it and picks its model up; removing it drops it from
history and unopens it.

```quint
pure def canOpen(c: Chat, id: str): bool = thread(c, id).length() > 0

pure def open(c: Chat, id: str): Chat =
  val ts = thread(c, id)
  val t = ts.nthOr(0, { id: id, model: c.model, messages: List() })
  if (ts.length() == 0) c else { threads: c.threads, active: id, model: t.model }

pure def canRemove(c: Chat, id: str): bool = thread(c, id).length() > 0

pure def remove(c: Chat, id: str): Chat =
  { threads: c.threads.select((x) => x.id != id), active: if (c.active == id) "" else c.active, model: c.model }
```

### An earlier user message can be edited and sent again

Editing truncates the thread at the chosen user message and sends the new
text from there; the model answers over the shorter history.

```quint
pure def canEdit(c: Chat, id: str, index: int, text: str): bool =
  val ts = thread(c, id)
  val t = ts.nthOr(0, { id: "", model: "", messages: List() })
  val at = t.messages.nthOr(index, { role: Assistant, content: "", model: "" })
  text != "" and ts.length() > 0 and 0 <= index and index < t.messages.length() and at.role == User

pure def edit(c: Chat, id: str, index: int, text: str): Chat =
  val ts = thread(c, id)
  val t = ts.nthOr(0, { id: id, model: c.model, messages: List() })
  if (ts.length() == 0 or index < 0 or index >= t.messages.length()) c
  else {
    ...c,
    threads: replaceThread(c.threads, id,
      { ...t, messages: takeMessages(t.messages, index).concat(List({ role: User, content: text, model: t.model })) }),
  }
```

### Every thread alternates a user turn with an assistant turn

```quint
pure def alternates(xs: List[Message]): bool =
  xs.length() == 0 or
    xs.tail().foldl({ ok: xs.head().role == User, prev: xs.head() },
      (acc, m) => { ok: acc.ok and m.role != acc.prev.role, prev: m }).ok

pure def alwaysTurnsAlternate(c: Chat): bool =
  c.threads.every((t) => alternates(t.messages))
```

### The open thread always exists, or none is open

```quint
pure def alwaysActiveIsRealOrNone(c: Chat): bool =
  c.active == "" or thread(c, c.active).length() == 1
```

### Thread ids are never repeated

```quint
pure def alwaysThreadIdsUnique(c: Chat): bool =
  c.threads.every((t) => c.threads.select((x) => x.id == t.id).length() == 1)
```

### A send leaves the other threads alone

```quint
pure def lawSendKeepsOtherThreads(c: Chat, id: str, model: str, text: str): bool =
  val after = send(c, id, model, text)
  alwaysThreadIdsUnique(c) implies
    c.threads.select((t) => t.id != id).every((t) =>
      after.threads.select((x) => x.id == t.id and x.messages == t.messages).length() == 1)
```

### A reply touches at most one thread

```quint
pure def stepAtMostOneThreadChanges(before: Chat, via: str, after: Chat): bool =
  via != "reply" or
    not(before.threads.some((t) =>
      not(after.threads.some((x) => x.id == t.id and x.messages == t.messages)) and
      before.threads.some((u) => u != t and
        not(after.threads.some((x) => x.id == u.id and x.messages == u.messages)))))
```

### A model can answer

```quint
pure def sometimesAnswered(c: Chat): bool =
  c.threads.some((t) => t.messages.some((m) => m.role == Assistant))
```

### The history can hold more than one conversation

```quint
pure def sometimesHistory(c: Chat): bool = c.threads.length() > 1
```

```quint
pure val idValues = Set("chat-1", "chat-2", "chat-3")

pure val modelValues = Set("deepseek-ai/DeepSeek-V4.1-Flash-1017", "z-ai/glm-5.3-flash", "Qwen/Qwen3.6-35B-A3B-FP8", "")

pure val textValues = Set("What is a TEE?", "Summarize this note in one sentence.", "Tell me more", "")

pure val indexValues = Set(0, 1, 2)
```
