# Gateway

The OpenAI-compatible inference API and its metering. The public surface
lives under `/api/sonnely/v1`: chat completions (JSON and streamed SSE),
embeddings, rerank, responses, redact, systemone, image generations and
edits, audio speech, transcriptions and translations, file conversion, the
model catalog, provider inventory and the authenticated key's status. A
resumable batch sends its rows through `/api/sonnely/batch/chat`, and the
retired `/api/v1` answers `410`.

Provider calls sit behind the gateway's inference service. In staging the
synchronous OpenAI-shaped routes return deterministic completions in that
wire shape, while the realtime transcription route refuses the WebSocket
upgrade when no realtime provider is configured. The specs here never claim
invented inference.

- [Keyring](./keyring.md): bearer-key authorization and metered spend on the
  shared `keys` store.
- [Requests](./requests.md): the ledger of served requests — authorized,
  registered, charged exactly once.
- [Realtime](./realtime.md): the metered WebSocket transcription session.
- [Batch](./batch.md): the resumable, client-owned batch job lifecycle.
