# Console

The workspace surface a signed-in wallet works from: the playground chat,
the model catalog, request logs, batch inference and the workspace settings.
Keys, usage, billing, teams, referrals, support and admin are neighboring
areas; the console frame links to every section and gates the signed-in ones
on a session.

- [Chat](./chat.md): playground conversations with an assistant.
- [Catalog](./catalog.md): the providers' models and their Sonnely rates.
- [Logs](./logs.md): the workspace's request history and its filters.
- [Batch](./batch.md): a JSONL batch's lifecycle on this device.

## Domain

### Console settings are a profile and a set of workspace choices

The console keeps one record for the workspace: the display name and
username the profile shows, and the workspace's choices of theme,
plain-writing requests and chat history. Chat history lives server-side
with the workspace, not in the browser: while the history choice is on, the
playground writes each prompt and answer to the workspace's machine, and a
wallet that turns it off writes nothing there — the conversation lasts only
as long as the browser session.

```quint
type Theme = System | Light | Dark

type Console = {
  name: str,
  username: str,
  theme: Theme,
  plain: bool,
  history: bool,
}
```

### The console starts unnamed with factory defaults

The factory settings keep chat history, as the playground always has; a
workspace opts out rather than in.

```quint
pure val initial: Console = { name: "", username: "", theme: Dark, plain: true, history: true }
```

## Story: Set up the workspace profile

> As a workspace owner, I want to name my profile, so that the console shows
> who I am.

### Saving a profile only happens when something changed

The settings form sends the fields it shows; a save that would change
nothing is not sent.

```quint
pure def canSaveProfile(c: Console, name: str, username: str): bool =
  name != c.name or username != c.username

pure def saveProfile(c: Console, name: str, username: str): Console =
  { ...c, name: name, username: username }
```

### A saved profile keeps the device choices

```quint
pure def lawSaveProfileKeepsDeviceChoices(c: Console, name: str, username: str): bool =
  val saved = saveProfile(c, name, username)
  saved.theme == c.theme and saved.plain == c.plain and saved.history == c.history
```

### A profile can be personalized

```quint
pure def sometimesPersonalized(c: Console): bool = c.name != "" and c.username != ""
```

## Story: Choose how this device shows the console

> As a user, I want my theme and chat preferences to stick, so that the
> console looks and answers the way I asked.

### Choosing a theme changes the theme

The segmented control only fires on a real change.

```quint
pure def canChooseTheme(c: Console, theme: Theme): bool = theme != c.theme

pure def chooseTheme(c: Console, theme: Theme): Console = { ...c, theme: theme }
```

### The plain-writing choice toggles

Plain writing asks the chat model for concise, clear language. When it is
on, the chat request assembly prepends a system instruction asking for
concise, clear language.

```quint
pure def setPlain(c: Console, on: bool): Console = { ...c, plain: on }
```

### Plain writing can be turned off

```quint
pure def sometimesPlainOff(c: Console): bool = not(c.plain)
```

## Story: Choose whether the workspace keeps chat history

> As a user, I want to decide whether the server keeps my playground
> conversations, so that prompts I never want retained are not written
> server-side at all.

### The chat-history choice toggles

While the choice is on, the playground writes each turn to the workspace's
server-side machine and conversations reopen on any device. When it is off,
the browser holds the conversation for the session and nothing is written
to the machine — the choice governs what is written next, not what is
already kept; clearing what is kept is the playground's own transition.

```quint
pure def setHistory(c: Console, on: bool): Console = { ...c, history: on }
```

### Chat history can be turned off

```quint
pure def sometimesHistoryOff(c: Console): bool = not(c.history)
```
