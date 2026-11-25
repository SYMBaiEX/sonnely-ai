# Session

A workspace session is established by a Solana wallet signature: the wallet
that signs is the workspace the session opens. Signing out ends it. Everything
a session reaches — keys, credits, usage, team — belongs to the wallet it
names.

The machine keeps a registry of sign-in challenges and established sessions.
A challenge binds one wallet, site and expiry to a nonce. The shell verifies
the wallet's signature over the exact challenge message before it sends the
establishing event; the machine rules make that challenge single-use and bind
the session to the wallet the challenge names. A session credential itself is
never stored: only its SHA-256 digest is.

## Domain

### Signing state is a registry of challenges and sessions

```quint
type ChallengeState = ChallengeOpen | ChallengeConsumed | ChallengeExpired

type LoginState = LoginActive | LoginEnded | LoginExpired

type Challenge = {
  nonce: str,
  wallet: str,
  domain: str,
  uri: str,
  issuedAt: int,
  expiresAt: int,
  state: ChallengeState,
}

type Login = {
  digest: str,
  nonce: str,
  wallet: str,
  createdAt: int,
  expiresAt: int,
  state: LoginState,
}

type Sessions = { challenges: List[Challenge], logins: List[Login] }

pure val initial: Sessions = { challenges: List(), logins: List() }
```

### Challenges and sessions are found by nonce and credential digest

```quint
pure def challengeWithNonce(s: Sessions, nonce: str): List[Challenge] =
  s.challenges.select(c => c.nonce == nonce)

pure def loginWithDigest(s: Sessions, digest: str): List[Login] =
  s.logins.select(l => l.digest == digest)

pure def challengeWallet(challenge: List[Challenge]): str =
  challenge.foldl("", (wallet, c) => c.wallet)

pure def activeWallet(s: Sessions, digest: str, now: int): str =
  loginWithDigest(s, digest).foldl("", (wallet, login) =>
    if (login.state == LoginActive and login.expiresAt > now) login.wallet else wallet)
```

```quint
pure val nonceValues = Set("nonce-a", "nonce-b")

pure val digestValues = Set("digest-a", "digest-b")

pure val walletValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn")

pure val domainValues = Set("localhost:3111", "sonnely.com")

pure val uriValues = Set("http://localhost:3111", "https://sonnely.com")

pure val issuedAtValues = Set(0, 1000)

pure val expiresAtValues = Set(1000, 5000, 10000)

pure val nowValues = Set(0, 1000, 5000, 10000)
```

## Story: Sign in with a wallet

> As a visitor, I want to sign in with my Solana wallet, so that the console
> shows my workspace and not someone else's.

### A challenge binds one wallet, site and expiry

A sign-in challenge is fresh when its nonce has never been issued, its wallet
and site are named, and its expiry is after its issue time.

```quint
pure def canIssue(s: Sessions, nonce: str, wallet: str, domain: str, uri: str, issuedAt: int, expiresAt: int): bool =
  nonce != "" and wallet != "" and domain != "" and uri != "" and issuedAt >= 0 and expiresAt > issuedAt
  and challengeWithNonce(s, nonce).length() == 0

pure def issue(s: Sessions, nonce: str, wallet: str, domain: str, uri: str, issuedAt: int, expiresAt: int): Sessions =
  { ...s, challenges: s.challenges.append({
      nonce: nonce, wallet: wallet, domain: domain, uri: uri,
      issuedAt: issuedAt, expiresAt: expiresAt, state: ChallengeOpen }) }
```

### Only a verified signature consumes its challenge once

The API sends `establish` only after verifying the wallet's signature over the
exact sign-in message the challenge produced. The model requires the named
challenge to be open and unexpired, consumes it, and opens a session for the
challenge's wallet — never for a wallet supplied beside the signature.

```quint
pure def canEstablish(s: Sessions, nonce: str, digest: str, wallet: str, now: int, expiresAt: int): bool =
  nonce != "" and digest != "" and wallet != "" and now >= 0 and expiresAt > now
  and challengeWithNonce(s, nonce).length() == 1
  and challengeWithNonce(s, nonce).head().state == ChallengeOpen
  and challengeWithNonce(s, nonce).head().expiresAt > now
  and wallet == challengeWallet(challengeWithNonce(s, nonce))
  and loginWithDigest(s, digest).length() == 0
  and s.logins.every(l => l.nonce != nonce)

pure def establish(s: Sessions, nonce: str, digest: str, wallet: str, now: int, expiresAt: int): Sessions =
  {
    challenges: s.challenges.listMap(c =>
      if (c.nonce == nonce) { ...c, state: ChallengeConsumed } else c),
    logins: s.logins.append({
      digest: digest, nonce: nonce, wallet: wallet,
      createdAt: now, expiresAt: expiresAt, state: LoginActive }),
  }
```

### Only an active session can sign out

```quint
pure def canSignOut(s: Sessions, digest: str): bool =
  loginWithDigest(s, digest).some(l => l.state == LoginActive)

pure def signOut(s: Sessions, digest: str): Sessions =
  { ...s, logins: s.logins.listMap(l =>
      if (l.digest == digest and l.state == LoginActive) { ...l, state: LoginEnded } else l) }
```

### Expiry closes open challenges and active sessions

A challenge or session whose deadline has passed cannot be used later. The
shell sends `expire` when it reads or writes the registry; expiry is a state
change, not a wall-clock side effect hidden outside the machine.

```quint
pure def canExpire(s: Sessions, now: int): bool =
  now >= 0 and (
    s.challenges.some(c => c.state == ChallengeOpen and c.expiresAt <= now)
    or s.logins.some(l => l.state == LoginActive and l.expiresAt <= now))

pure def expire(s: Sessions, now: int): Sessions =
  {
    challenges: s.challenges.listMap(c =>
      if (c.state == ChallengeOpen and c.expiresAt <= now) { ...c, state: ChallengeExpired } else c),
    logins: s.logins.listMap(l =>
      if (l.state == LoginActive and l.expiresAt <= now) { ...l, state: LoginExpired } else l),
  }
```

### Every challenge and session is well formed

Uniqueness and single-use are transition guards: a nonce may be issued once, a
credential digest may be established once, and a challenge that already has a
login cannot establish another. The invariant kept over stored state is the
shape those guards maintain: every challenge and session is well formed.

```quint
pure def alwaysSessionsAreSound(s: Sessions): bool =
  s.challenges.every(c =>
    c.nonce != "" and c.wallet != "" and c.domain != "" and c.uri != ""
    and c.issuedAt >= 0 and c.expiresAt > c.issuedAt)
  and s.logins.every(l =>
    l.digest != "" and l.nonce != "" and l.wallet != ""
    and l.createdAt >= 0 and l.expiresAt > l.createdAt)
```

### Signing out is idempotent in effect

```quint
pure def lawSignOutIsIdempotent(s: Sessions, digest: str): bool =
  signOut(signOut(s, digest), digest) == signOut(s, digest)
```

### A session can be established

```quint
pure def sometimesEstablished(s: Sessions): bool =
  s.logins.some(l => l.state == LoginActive)
```

```quint
pure val eval_witness_sometimesEstablished =
  (("issue", "nonce-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "localhost:3111", "http://localhost:3111", 0, 5000),
   ("establish", "nonce-a", "digest-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", 0, 10000))
```

### A session can end and a challenge can expire

```quint
pure def sometimesEnded(s: Sessions): bool =
  s.logins.some(l => l.state == LoginEnded)

pure def sometimesChallengeExpired(s: Sessions): bool =
  s.challenges.some(c => c.state == ChallengeExpired)
```

```quint
pure val eval_witness_sometimesEnded =
  (("issue", "nonce-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "localhost:3111", "http://localhost:3111", 0, 5000),
   ("establish", "nonce-a", "digest-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", 0, 10000),
   ("signOut", "digest-a"))

pure val eval_witness_sometimesChallengeExpired =
  (("issue", "nonce-a", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "localhost:3111", "http://localhost:3111", 0, 5000),
   ("expire", 5000))
```
