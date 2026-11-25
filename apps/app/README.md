# @repo/app — the Sonnely application

The whole Sonnely platform as one [Vibestack](https://github.com/lalalune/vibestack)
application: the public site, the documentation, the console, and the
OpenAI-compatible inference API.

Its requirements are the spec tree at [`spec/`](../../spec/index.md): every
area (`spec/app/<area>/`) is a Quint state machine with stories and rules, and
`pnpm check` generates the verified core into `gen/` and proves it. Nothing in
here keeps state outside a spec machine.

| Piece | What |
|---|---|
| `src/main.vibe` | Entry: serves the SPA and mounts every area's API + machine layers |
| `src/serve.vibe`, `src/machines.vibe` | HTTP plumbing: static SPA with fallback, machine event/snapshot/SSE endpoints |
| `src/api/<area>.vibe` | One machine shell per area; the gateway's OpenAI-compatible routes |
| `src/web/areas/<area>/` | React rendering per page type, auto-discovered by `App.tsx` |
| `src/web/remote.ts` | `useRemote(name)`: server machine state over SSE |
| `test/drivers/` | Conformance drivers: the stored machines replayed against their spec |

State persists under `dist/data/` (filesystem KeyValueStore) when built, or
alongside the dev entry. Set `PORT` to choose the server port (default: random).
