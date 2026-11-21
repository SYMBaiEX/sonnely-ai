import { SecureClient } from "tinfoil";

// The SDK verifies the router and encrypts the request to its attested EHBP key.
// Account-specific cache scope is set in the body; this value avoids filesystem persistence.
const client = new SecureClient({ userCacheSecret: "sonnely-explicit-scope" });

export async function fetchTinfoil(init: RequestInit) {
  await client.ready();
  init.signal?.throwIfAborted();
  const response = await client.fetch("/v1/chat/completions", init);
  const verification = client.getVerificationDocument();
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
