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
  type SolanaSignInOutput,
} from "@solana/wallet-standard-features";
import { ChevronDown, Wallet as WalletIcon } from "lucide-react";
import { shortenWallet as shorten } from "./format.ts";
import { canAuthenticateWallet, isMobileAdapter, mobileAdapterName, registerMobileWallet, solanaWalletClients } from "./solana-wallet.ts";

async function sessionRequest<T>(task: string, data?: unknown): Promise<T> {
  const response = await fetch(
    "/api/session/" + task,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
          cache: "no-store",
        },
  );
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "The wallet request failed.");
  return payload as T;
}

export function useBillingCluster() {
  const [cluster, setCluster] = useState<"mainnet" | "devnet">("mainnet");
  useEffect(() => {
    let active = true;
    void fetch("/api/billing/config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (active && config?.cluster === "devnet") setCluster("devnet");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return cluster;
}

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
    const { input, message } = await sessionRequest<{ input: SolanaSignInInput; message: string }>("challenge", {
      wallet: account.address,
    });
    let signature: readonly number[];
    let signedMessage: readonly number[] | undefined;
    let signedMessageFormat: SolanaSignInOutput["signedMessageFormat"];
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
      signature = [...output.signature];
      signedMessage = [...output.signedMessage];
      if (output.signedMessageFormat?.kind === "offchainMessage") signedMessageFormat = output.signedMessageFormat;
    } else {
      if (client.wallet.getState().connected?.account.address !== account.address) {
        throw new Error("The wallet changed while preparing this sign-in. Try again.");
      }
      if (canSignOffchain) {
        const envelope = await client.wallet.signOffchainMessage({ message, version: 1 }, options);
        const detachedSignature = envelope.signatures[address(account.address)];
        if (!detachedSignature) throw new Error("The wallet did not return an off-chain signature.");
        signature = [...detachedSignature];
        signedMessage = [...envelope.content];
        signedMessageFormat = { kind: "offchainMessage", messageVersion: 1 };
      } else if (account.features.includes(SolanaSignMessage)) {
        signature = [...(await client.wallet.signMessage(new TextEncoder().encode(message), options))];
      } else {
        throw new Error("This account does not support signing in.");
      }
    }
    abortSignal.throwIfAborted();
    await sessionRequest("verify", { wallet: account.address, signature, signedMessage, signedMessageFormat });
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
