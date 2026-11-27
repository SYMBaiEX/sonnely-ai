# Gateway realtime

The WebSocket realtime transcription session. The shell authorizes the bearer
key or the signed-in console wallet before upgrading, refuses the upgrade when
no realtime provider is configured, and bridges audio only to that provider:
the endpoint never invents a transcript. The session reserves the catalog's
full-session price when it opens and settles the proportion of it that the
PCM audio duration represents when the session closes.

## Domain

### One realtime session

`reserve` and `charge` are micro-USD; `charge` is `-1` until the session is
`Closed`. `audioBytes` counts mono 16 kHz PCM16 bytes accepted for the
upstream buffer, at most 30 seconds. `transcription` counts the characters
the provider has emitted in deltas.

```quint
import keyring as K from "./keyring"
import requests as R from "./requests"

type SessionPhase = Connecting | Live | Closing | Closed

type RealtimeSession = {
  phase: SessionPhase,
  ref: str,
  key: K::KeyRecord,
  model: str,
  reserve: int,
  audioBytes: int,
  committed: bool,
  transcription: int,
  charge: int,
}

pure val initial: RealtimeSession = {
  phase: Connecting,
  ref: "",
  key: { id: "", prefix: "", status: K::Revoked, spendLimit: -1, spent: 0 },
  model: "",
  reserve: -1,
  audioBytes: 0,
  committed: false,
  transcription: 0,
  charge: -1,
}

pure val realtimeAudioLimit = 960000

pure def proportionalCost(reserve: int, audioBytes: int): int =
  if (audioBytes <= 0) 0 else (reserve * audioBytes + realtimeAudioLimit - 1) / realtimeAudioLimit
```

### Values the checks sample

```quint
pure val refValues = Set("rt_alpha", "rt_beta")

pure val keyValues = Set(
  { id: "key_alpha", prefix: "sonnely_live_a", status: K::Active, spendLimit: -1, spent: 0 },
  { id: "key_beta", prefix: "sonnely_live_b", status: K::Active, spendLimit: 100, spent: 50 },
  { id: "key_gamma", prefix: "fr_live_g", status: K::Revoked, spendLimit: -1, spent: 0 }
)

pure val modelValues = Set("voxtral-mini-4b-realtime", "unknown/model")

pure val reserveValues = Set(1, 2200)

pure val bytesValues = Set(2, 32, 6400, 960001)

pure val charsValues = Set(1, 8, 64)

pure val costValues = Set(0, 1, 15, 2200)
```

## Story: Run a metered realtime transcription

> As the gateway, I want to open one realtime session only for a live key and
> the realtime model, accept bounded audio until the client commits it, close
> through one settlement, and charge only the proportion of the reserved
> session price that the audio duration represents, so that a session can
> never be charged twice or without audio being sent upstream.

### A session opens only for a serving key and the realtime model

The shell resolves the bearer credential before this event and rejects the
HTTP upgrade without opening a session when the key, model, budget or
provider is unavailable.

```quint
pure def canOpen(s: RealtimeSession, ref: str, key: K::KeyRecord, model: str, reserve: int): bool =
  s.phase == Connecting and ref != "" and reserve > 0 and
  K::mayServe(key) and R::registered(R::Realtime, model)

pure def open(s: RealtimeSession, ref: str, key: K::KeyRecord, model: str, reserve: int): RealtimeSession =
  { phase: Live, ref: ref, key: key, model: model, reserve: reserve,
    audioBytes: 0, committed: false, transcription: 0, charge: -1 }
```

### Audio is bounded PCM and cannot be appended after commit

```quint
pure def canAppendAudio(s: RealtimeSession, bytes: int): bool =
  s.phase == Live and not(s.committed) and bytes > 0 and bytes % 2 == 0 and
  s.audioBytes + bytes <= realtimeAudioLimit

pure def appendAudio(s: RealtimeSession, bytes: int): RealtimeSession =
  { ...s, audioBytes: s.audioBytes + bytes }

pure def canCommit(s: RealtimeSession): bool =
  s.phase == Live and not(s.committed) and s.audioBytes > 0

pure def commit(s: RealtimeSession): RealtimeSession = { ...s, committed: true }
```

### Transcription deltas arrive only after the audio is committed

```quint
pure def canDelta(s: RealtimeSession, chars: int): bool =
  s.phase == Live and s.committed and chars > 0

pure def delta(s: RealtimeSession, chars: int): RealtimeSession =
  { ...s, transcription: s.transcription + chars }
```

### A committed session closes through exactly one proportional settlement

Closing is the provider finishing or the transport ending after commit. The
settlement charge is the reserve prorated by accepted audio duration.

```quint
pure def canClose(s: RealtimeSession): bool = s.phase == Live and s.committed

pure def close(s: RealtimeSession): RealtimeSession = { ...s, phase: Closing }

pure def canSettleSession(s: RealtimeSession, cost: int): bool =
  s.phase == Closing and cost == proportionalCost(s.reserve, s.audioBytes)

pure def settleSession(s: RealtimeSession, cost: int): RealtimeSession =
  { ...s, phase: Closed, charge: cost }
```

### An uncommitted session is abandoned without a charge

```quint
pure def canAbandon(s: RealtimeSession): bool = s.phase == Live and not(s.committed)

pure def abandon(s: RealtimeSession): RealtimeSession =
  { ...s, phase: Closed, charge: 0 }
```

### Open sessions are authorized for the realtime model

```quint
pure def alwaysOpenSessionsAuthorized(s: RealtimeSession): bool =
  s.phase == Connecting or (K::mayServe(s.key) and R::registered(R::Realtime, s.model))
```

### Session measurements stay inside the audio envelope

```quint
pure def alwaysSessionMeasurements(s: RealtimeSession): bool =
  (s.phase == Connecting or s.reserve > 0) and
  s.audioBytes >= 0 and s.audioBytes <= realtimeAudioLimit and s.transcription >= 0 and
  (not(s.committed) or s.audioBytes > 0) and
  (s.phase != Connecting or (s.audioBytes == 0 and s.transcription == 0 and not(s.committed))) and
  (s.phase != Closing or s.committed)
```

### Charges exist only in closed sessions and match the audio duration

```quint
pure def alwaysChargeLifecycle(s: RealtimeSession): bool =
  ((s.charge >= 0) iff (s.phase == Closed)) and
  (s.phase != Closed or s.charge == (if (s.committed) proportionalCost(s.reserve, s.audioBytes) else 0))
```

### Session measurements never go back

```quint
pure def stepMeasurementsNeverShrink(before: RealtimeSession, after: RealtimeSession): bool =
  after.audioBytes >= before.audioBytes and after.transcription >= before.transcription
```

### A closed session never reopens

```quint
pure def stepClosedStaysClosed(before: RealtimeSession, after: RealtimeSession): bool =
  before.phase != Closed or after.phase == Closed
```

### A session can go live

```quint
pure def sometimesLive(s: RealtimeSession): bool = s.phase == Live
```

### A session can settle a proportional charge

```quint
pure val eval_witness_sometimesSettled = (
  ("open", "rt_alpha", { id: "key_alpha", prefix: "sonnely_live_a", status: K::Active, spendLimit: -1, spent: 0 }, "voxtral-mini-4b-realtime", 2200),
  ("appendAudio", 6400),
  "commit",
  ("delta", 8),
  "close",
  ("settleSession", 15)
)

pure def sometimesSettled(s: RealtimeSession): bool =
  s.phase == Closed and s.charge > 0
```

### An uncommitted session can end without a charge

```quint
pure val eval_witness_sometimesAbandoned = (
  ("open", "rt_alpha", { id: "key_alpha", prefix: "sonnely_live_a", status: K::Active, spendLimit: -1, spent: 0 }, "voxtral-mini-4b-realtime", 2200),
  "abandon"
)

pure def sometimesAbandoned(s: RealtimeSession): bool =
  s.phase == Closed and not(s.committed) and s.charge == 0
```
