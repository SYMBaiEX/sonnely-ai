# Referrals

The invite pipeline: the codes wallets share, the sign-ups each code
credited and the stage every referral has reached — signed up, funded or
active.

## Domain

### Codes, sign-ups and stages

```quint
type Stage = SignedUp | Funded | Active

type Code = { code: str, owner: str }

type Signup = { wallet: str, code: str, stage: Stage, joined: int }

type Referrals = { codes: List[Code], signups: List[Signup] }

pure val initial: Referrals = { codes: List(), signups: List() }

pure def ownerOf(r: Referrals, code: str): str =
  val found = r.codes.select(c => c.code == code)
  if (found.length() == 0) "" else found.head().owner

pure def stageRank(stage: Stage): int =
  match stage { | SignedUp => 0 | Funded => 1 | Active => 2 }

pure def rankOf(r: Referrals, wallet: str): int =
  val found = r.signups.select(s => s.wallet == wallet)
  if (found.length() == 0) -1 else stageRank(found.head().stage)
```

## Story: Invite a wallet

> As a workspace owner, I want a personal invite code that credits me when
> it brings another wallet in, so that referrals grow the network.

### Each wallet issues one code

```quint
pure def canIssueCode(r: Referrals, wallet: str, code: str): bool =
  wallet != "" and code != "" and
  not(r.codes.some(c => c.code == code)) and
  not(r.codes.some(c => c.owner == wallet))

pure def issueCode(r: Referrals, wallet: str, code: str): Referrals =
  { ...r, codes: r.codes.concat(List({ code: code, owner: wallet })) }
```

### A wallet cannot refer itself

A sign-up credits a code only when the wallet that signs up is not the
code's owner.

```quint
pure def canSignup(r: Referrals, code: str, wallet: str): bool =
  wallet != "" and ownerOf(r, code) != "" and ownerOf(r, code) != wallet and
  not(r.signups.some(s => s.wallet == wallet))

pure def signup(r: Referrals, code: str, wallet: str, joined: int): Referrals =
  { ...r, signups: r.signups.concat(List({ wallet: wallet, code: code, stage: SignedUp, joined: joined })) }

pure def lawSignupCreditsOneCode(r: Referrals, code: str, wallet: str, joined: int): bool =
  not(canSignup(r, code, wallet)) or
  signup(r, code, wallet, joined).signups.length() == r.signups.length() + 1
```

### A referral's reward only moves forward

A referral's stage advances signed up → funded → active, each step allowed
only from the one before, so a stage never steps back.

```quint
pure def canMarkFunded(r: Referrals, wallet: str): bool =
  r.signups.some(s => s.wallet == wallet and s.stage == SignedUp)

pure def markFunded(r: Referrals, wallet: str): Referrals =
  { ...r, signups: r.signups.listMap(s => if (s.wallet == wallet and s.stage == SignedUp) { ...s, stage: Funded } else s) }

pure def canMarkActive(r: Referrals, wallet: str): bool =
  r.signups.some(s => s.wallet == wallet and s.stage == Funded)

pure def markActive(r: Referrals, wallet: str): Referrals =
  { ...r, signups: r.signups.listMap(s => if (s.wallet == wallet and s.stage == Funded) { ...s, stage: Active } else s) }
```

### An invite can reach funding and activity

```quint
pure def sometimesSignedUp(r: Referrals): bool =
  r.signups.some(s => s.stage == SignedUp)

pure def sometimesFunded(r: Referrals): bool =
  r.signups.some(s => s.stage == Funded)

pure def sometimesActive(r: Referrals): bool =
  r.signups.some(s => s.stage == Active)
```
