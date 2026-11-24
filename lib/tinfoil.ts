import { SecureClient } from "tinfoil";

// The SDK verifies the router and encrypts the request to its attested EHBP key.
// Account-specific cache scope is set in the body; this value avoids filesystem persistence.
const client = new SecureClient({ userCacheSecret: "sonnely-explicit-scope" });

const piiClient = new SecureClient({
  enclaveURL: "https://pii-filter.tinfoil.sh",
  configRepo: "tinfoilsh/confidential-pii-cpu",
  transport: "tls",
});
export async function fetchTinfoil(
  init: RequestInit,
  path: `/v1/${string}` | "/redact" = "/v1/chat/completions",
) {
  const verifiedClient = path === "/redact" ? piiClient : client;
  await verifiedClient.ready();
  const before = verifiedClient.getVerificationDocument();
  if (!before.securityVerified || !before.releaseDigest)
    throw new Error("Tinfoil router verification is unavailable.");
  init.signal?.throwIfAborted();
  const response = await verifiedClient.fetch(path, init);
  const verification = verifiedClient.getVerificationDocument();
  if (!verification.securityVerified || !verification.releaseDigest) {
    await response.body?.cancel();
    throw new Error("Tinfoil router verification is unavailable.");
  }
  return {
    response,
    evidence: {
      status: "attested_router",
      config_repo: verification.configRepo,
      release_digest: verification.releaseDigest,
    } as const,
  };
}

export async function openTinfoilRealtime(apiKey: string) {
  await client.ready();
  const verification = client.getVerificationDocument();
  if (!verification.securityVerified || !verification.releaseDigest)
    throw new Error("Tinfoil router verification is unavailable.");
  return client.createWebSocket("/v1/realtime?model=voxtral-mini-4b-realtime", {
    wsOptions: {
      headers: { Authorization: "Bearer " + apiKey },
      handshakeTimeout: 10_000,
      maxPayload: 64_000,
    },
  });
}
