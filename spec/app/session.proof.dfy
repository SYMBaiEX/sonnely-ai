// spec/app/session.md, "Every challenge and session is well formed": each transition either
// appends or rewrites a row whose fields the guard already requires to be well formed.

lemma issue_ensures(s: Sessions, nonce: string, wallet: string, domain: string, uri: string, issuedAt: int, expiresAt: int)
  ensures (inv(s) ==> canIssue(s, nonce, wallet, domain, uri, issuedAt, expiresAt) ==> alwaysSessionsAreSound(issue(s, nonce, wallet, domain, uri, issuedAt, expiresAt)))
{
}

lemma establish_ensures(s: Sessions, nonce: string, digest: string, wallet: string, now: int, expiresAt: int)
  ensures (inv(s) ==> canEstablish(s, nonce, digest, wallet, now, expiresAt) ==> alwaysSessionsAreSound(establish(s, nonce, digest, wallet, now, expiresAt)))
{
}

lemma signOut_ensures(s: Sessions, digest: string)
  ensures (inv(s) ==> canSignOut(s, digest) ==> alwaysSessionsAreSound(signOut(s, digest)))
{
}

lemma expire_ensures(s: Sessions, now: int)
  ensures (inv(s) ==> canExpire(s, now) ==> alwaysSessionsAreSound(expire(s, now)))
{
}
