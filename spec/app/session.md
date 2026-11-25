# Session

A workspace session is established by a Solana wallet signature: the wallet
that signs is the workspace the session opens. Signing out ends it. Everything
a session reaches — keys, credits, usage, team — belongs to the wallet it
names.

## Domain

### A session is signed out, or names the wallet it is signed in to

```quint
type Session = SignedOut | SignedIn({ wallet: str })

pure val initial: Session = SignedOut
```

```quint
pure val walletValues = Set("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "DjVE6JNiYq52M37YLBjLvDSMaVG9eRQFRkPRCPwdJnn")
```

## Story: Sign in with a wallet

> As a visitor, I want to sign in with my Solana wallet, so that the console
> shows my workspace and not someone else's.

### Only a wallet that names itself can sign in

A session opens when a wallet signature verifies; the name the session holds
is the wallet that signed, never a name asked for.

```quint
pure def canSignIn(s: Session, wallet: str): bool = wallet != "" and s != SignedIn({ wallet: wallet })

pure def signIn(s: Session, wallet: str): Session = SignedIn({ wallet: wallet })
```

### Only a signed-in session can sign out

```quint
pure def canSignOut(s: Session): bool = s != SignedOut

pure def signOut(s: Session): Session = SignedOut
```

### A signed-in session always names a wallet

```quint
pure def alwaysSignedInNamesAWallet(s: Session): bool =
  match s { | SignedOut => true | SignedIn(w) => w.wallet != "" }
```

### Signing in holds the wallet that signed

```quint
pure def lawSignInHoldsTheWallet(s: Session, wallet: str): bool =
  val opened = signIn(s, wallet)
  match opened { | SignedOut => false | SignedIn(w) => w.wallet == wallet }
```

### A session can be signed in

```quint
pure def sometimesSignedIn(s: Session): bool = s != SignedOut
```
