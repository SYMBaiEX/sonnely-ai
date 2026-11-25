# Gateway

The OpenAI-compatible inference API and its metering. The public surface
lives under `/api/sonnely/v1`: chat completions (JSON and streamed SSE),
embeddings, rerank, responses, redact, systemone, image generations and
edits, audio speech, transcriptions and translations, file conversion, the
model catalog, provider inventory and the authenticated key's status. A
resumable batch sends its rows through `/api/sonnely/batch/chat`, and the
retired `/api/v1` answers `410`.

In staging there is no upstream model provider: provider calls sit behind
the gateway's inference service and return deterministic completions in the
OpenAI wire shape. What the specs here do claim is what staging actually
does — authorization, metering, the ledger, the wire format — never real
inference.

- [Keyring](./keyring.md): bearer-key authorization and metered spend on the
  shared `keys` store.
- [Requests](./requests.md): the ledger of served requests — authorized,
  registered, charged exactly once.
- [Batch](./batch.md): the resumable, client-owned batch job lifecycle.
