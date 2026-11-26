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

### Console settings are a profile and a set of device choices

The console keeps one record for the workspace: the display name and
username the profile shows, and this device's choices of theme,
plain-writing requests and saved chat history.

```quint
type Theme = System | Light | Dark

type Console = {
  name: str,
  username: str,
  theme: Theme,
  plain: bool,
  saveOnDevice: bool,
}
```

### The console starts unnamed with factory defaults

```quint
pure val initial: Console = { name: "", username: "", theme: Dark, plain: true, saveOnDevice: false }
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
  saved.theme == c.theme and saved.plain == c.plain and saved.saveOnDevice == c.saveOnDevice
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

### The plain-writing and device-history choices toggle independently

Plain writing asks the chat model for concise, clear language; save on this
device keeps chat history in the browser.

```quint
pure def setPlain(c: Console, on: bool): Console = { ...c, plain: on }

pure def setSaveOnDevice(c: Console, on: bool): Console = { ...c, saveOnDevice: on }
```

### The device can be asked to keep chat history

```quint
pure def sometimesSavedOnDevice(c: Console): bool = c.saveOnDevice
```
