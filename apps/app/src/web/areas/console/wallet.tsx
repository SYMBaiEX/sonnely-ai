// spec/app/session.md, "Story: Sign in with a wallet"
import { useEffect, useId, useRef, useState } from "react";
import { address } from "@solana/kit";
import { supportsSignInWithOffchainMessage } from "@solana/kit-plugin-wallet";
import { useConnectedWallet, useIsWalletReady, useWallets } from "@solana/kit-plugin-wallet/react";
import { useAction } from "@solana/react";
import {
  SolanaSignAndSendTransaction,
  SolanaSignIn,
  SolanaSignMessage,
  SolanaSignOffchainMessage,
  SolanaSignTransaction,
  type SolanaSignInInput,
} from "@solana/wallet-standard-features";
import { ChevronDown, Wallet as WalletIcon } from "lucide-react";
import { shorten } from "./bits.tsx";
import { canAuthenticateWallet, isMobileAdapter, mobileAdapterName, registerMobileWallet, solanaWalletClients } from "./solana-wallet.ts";

export function WalletControl({
  wallet: signedInWallet,
  cluster,
  checkingAccount = false,
  onSignIn,
  onSignOut,
}: {
  wallet?: string;
  cluster: "mainnet" | "devnet";
  checkingAccount?: boolean;
  onSignIn: (wallet: string) => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const client = solanaWalletClients[cluster];
  const ready = useIsWalletReady(client);
  const connected = useConnectedWallet(client);
  const wallets = useWallets(client).filter((wallet) =>
    signedInWallet
      ? wallet.features.includes(SolanaSignAndSendTransaction) ||
        (wallet.features.includes(SolanaSignTransaction) && wallet.features.includes(SolanaSignMessage))
      : canAuthenticateWallet(wallet),
  );

  useEffect(() => {
    registerMobileWallet(`solana:${cluster}`);
  }, [cluster]);

  function closeWallet() {
    setOpen(false);
    trigger.current?.focus();
  }

  const connect = useAction(async (abortSignal, wallet: (typeof wallets)[number]) => {
    const options = { abortSignal };
    const accounts = await client.wallet.connect(wallet, options);
    abortSignal.throwIfAborted();
    const chainAccounts = accounts.filter((account) => account.chains.includes(`solana:${cluster}`));
    if (signedInWallet) {
      const account = chainAccounts.find((item) => item.address === signedInWallet);
      if (!account) throw new Error("Select the same account and network you used to sign in.");
      client.wallet.selectAccount(account);
      closeWallet();
      return;
    }
    const account = chainAccounts[0];
    if (!account) throw new Error(`Select an account that supports Solana ${cluster}.`);
    client.wallet.selectAccount(account);
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const message = `${location.host} wants you to sign in with your Solana account:\n${account.address}\n\nSonnely workspace sign-in\n\nURI: ${location.origin}\nVersion: 1\nChain ID: ${cluster}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
    const input: SolanaSignInInput = {
      domain: location.host,
      address: account.address,
      statement: "Sonnely workspace sign-in",
      uri: location.origin,
      version: "1",
      chainId: cluster,
      nonce,
      issuedAt: new Date().toISOString(),
    };
    const nativeSignIn = wallet.features.includes(SolanaSignIn) && !isMobileAdapter(wallet.name);
    const offchainSignIn = nativeSignIn && supportsSignInWithOffchainMessage(wallet);
    const canSignOffchain = account.features.includes(SolanaSignOffchainMessage);
    if (nativeSignIn && (offchainSignIn || !canSignOffchain)) {
      const output = await client.wallet.signIn(
        wallet,
        offchainSignIn ? { ...input, useOffchainMessage: { messageVersion: 1 } } : input,
        options,
      );
      if (output.account.address !== account.address) throw new Error("The wallet signed in with a different address.");
    } else {
      if (client.wallet.getState().connected?.account.address !== account.address) {
        throw new Error("The wallet changed while preparing this sign-in. Try again.");
      }
      if (canSignOffchain) {
        const envelope = await client.wallet.signOffchainMessage({ message, version: 1 }, options);
        if (!envelope.signatures[address(account.address)]) throw new Error("The wallet did not return an off-chain signature.");
      } else if (account.features.includes(SolanaSignMessage)) {
        await client.wallet.signMessage(new TextEncoder().encode(message), options);
      } else {
        throw new Error("This account does not support signing in.");
      }
    }
    abortSignal.throwIfAborted();
    if (!(await onSignIn(account.address))) throw new Error("The workspace session refused this wallet.");
    closeWallet();
  });

  const disconnect = useAction(async (abortSignal) => {
    await onSignOut();
    await client.wallet.disconnect(undefined, { abortSignal }).catch(() => {});
    closeWallet();
  });
  const busy = connect.isRunning || disconnect.isRunning;
  const error = disconnect.error ?? connect.error;
  const failure = busy || !error ? "" : error instanceof Error ? error.message : "Wallet action failed.";
  const walletLabel = signedInWallet ? shorten(signedInWallet) : checkingAccount ? "Checking wallet…" : "Connect wallet";

  return (
    <div
      className="wallet-widget"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        closeWallet();
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="button wallet-button"
        aria-label={signedInWallet ? `${walletLabel}, wallet options` : walletLabel}
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        disabled={checkingAccount}
        aria-disabled={busy || undefined}
        onClick={() => {
          if (busy) return;
          connect.reset();
          disconnect.reset();
          setOpen(!open);
        }}
      >
        <WalletIcon size={16} aria-hidden="true" />
        <span className="wallet-button-label">{walletLabel}</span>
        <ChevronDown size={14} className="wallet-button-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="wallet-pop panel">
          <strong>{signedInWallet ? "Wallet connection" : "Solana wallets"}</strong>
          {signedInWallet && connected?.account.address === signedInWallet && <p className="muted">Connected to {connected.wallet.name}</p>}
          {!ready ? (
            <p role="status">Looking for Solana wallets…</p>
          ) : wallets.length ? (
            wallets.map((wallet) => (
              <button
                className="button quiet full"
                type="button"
                key={wallet.name}
                onClick={() => {
                  disconnect.reset();
                  connect.dispatch(wallet);
                }}
                disabled={busy}
              >
                {wallet.name === mobileAdapterName ? "Solana mobile wallet" : wallet.name}
              </button>
            ))
          ) : (
            <>
              <p>Open this page in your Solana wallet’s browser on mobile. On Seeker, use Chrome.</p>
              <a className="text-link" href="/docs/quickstart#set-up-your-workspace">
                Wallet setup guide
              </a>
            </>
          )}
          {signedInWallet && (
            <button
              className="button quiet full"
              type="button"
              disabled={busy}
              onClick={() => {
                connect.reset();
                disconnect.dispatch();
              }}
            >
              Sign out
            </button>
          )}
          {busy && <p role="status">Waiting for wallet or server…</p>}
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
