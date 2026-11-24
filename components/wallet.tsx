"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import {
  address,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isTransactionSendingSigner,
} from "@solana/kit";
import { supportsSignInWithOffchainMessage } from "@solana/kit-plugin-wallet";
import { useConnectedWallet, useIsWalletReady, useWallets } from "@solana/kit-plugin-wallet/react";
import { useAction } from "@solana/react";
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignIn,
  SolanaSignOffchainMessage,
  type SolanaSignInInput,
  type SolanaSignInOutput,
} from "@solana/wallet-standard-features";
import { Wallet as WalletIcon, ChevronDown } from "lucide-react";
import { shorten } from "@/lib/models";
import {
  canAuthenticateWallet,
  isMobileAdapter,
  mobileAdapterName,
  registerMobileWallet,
  solanaWalletClients,
} from "./solana-wallet";

export type Session = {
  profile: {
    wallet: string;
    name: string;
    username?: string;
    balance: number;
    referral: string;
    role?: "admin" | "support" | "finance" | "member";
    onboarding?: "pending" | "fund" | "later";
  } | null;
  enabled: boolean;
  termsRequired?: boolean;
  billingEnabled: boolean;
  paymentVerificationEnabled: boolean;
  inferenceEnabled: boolean;
  cluster: string;
};

export async function request<T>(task: string, data?: unknown): Promise<T> {
  const response = await fetch(
    "/api/sonnely/" + task,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          cache: "no-store",
        },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request failed.");
  return payload as T;
}

type LiveSnapshot = NonNullable<FunctionReturnType<typeof api.sonnely.consoleLive>>;
export type UsageRow = LiveSnapshot["rows"][number];

export function useSession(liveDays?: number) {
  const [session, setSession] = useState<Session | null>(null);
  const [failure, setFailure] = useState("");
  const [liveUsage, setLiveUsage] = useState<{ wallet: string; days: number; rows: UsageRow[] }>();
  const wallet = session?.profile?.wallet;

  useEffect(() => {
    if (!wallet || liveDays === undefined) return;
    let source: EventSource | undefined;
    function listen() {
      source?.close();
      if (document.visibilityState === "hidden") return;
      source = new EventSource("/api/sonnely/live" + (liveDays ? "?days=" + liveDays : ""));
      source.onmessage = (event) => {
        const snapshot = JSON.parse(event.data) as LiveSnapshot | null;
        if (!snapshot) {
          source?.close();
          setSession((current) =>
            current && current.profile?.wallet === wallet
              ? { ...current, profile: null, billingEnabled: false, inferenceEnabled: false }
              : current,
          );
          setLiveUsage(undefined);
        } else if (snapshot.wallet === wallet) {
          setSession((current) =>
            current?.profile?.wallet === wallet && current.profile.balance !== snapshot.balance
              ? { ...current, profile: { ...current.profile, balance: snapshot.balance } }
              : current,
          );
          if (liveDays) setLiveUsage({ wallet, days: liveDays, rows: snapshot.rows });
        }
      };
    }
    listen();
    document.addEventListener("visibilitychange", listen);
    return () => {
      source?.close();
      document.removeEventListener("visibilitychange", listen);
    };
  }, [wallet, liveDays]);

  async function refresh() {
    try {
      setSession(await request<Session>("session"));
      setFailure("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Account service unavailable.");
    }
  }

  useEffect(() => {
    if (new URLSearchParams(location.search).has("ref")) {
      const invite = new URLSearchParams(location.search).get("ref") ?? "";
      if (/^[a-f0-9]{16}$/.test(invite)) sessionStorage.setItem("sonnely.invite", invite);
    }
    void refresh();
  }, []);
  const liveRows =
    liveUsage && liveUsage.wallet === wallet && liveUsage.days === liveDays ? liveUsage.rows : undefined;
  return { session, failure, refresh, liveRows };
}

export async function payWithWallet(
  walletAddress: string,
  reference: string,
  cluster: string,
  task: "payment-transaction" | "admin-payout-transaction" = "payment-transaction",
) {
  if (cluster !== "mainnet" && cluster !== "devnet") throw new Error("Unsupported Solana network.");
  const { wallet } = solanaWalletClients[cluster];
  await wallet.whenReady();
  const connected = wallet.getState().connected;
  if (connected?.account.address !== walletAddress || !connected.account.chains.includes(`solana:${cluster}`)) {
    throw new Error(
      task === "payment-transaction"
        ? "Connect your signed-in wallet from the console header, or use the Solana Pay link."
        : "Connect the treasury wallet from the console header.",
    );
  }
  const { signer, supportedTransactionVersions } = connected;
  const version = ([1, 0] as const).find((candidate) => supportedTransactionVersions.has(candidate));
  if (!signer || !isTransactionSendingSigner(signer) || version === undefined) {
    throw new Error("Use a wallet that supports sending Solana v0 or v1 transactions.");
  }

  const { transaction } = await request<{ transaction: string }>(task, { reference, version });
  const current = wallet.getState().connected;
  if (current?.account !== connected.account || current.signer !== signer) {
    throw new Error("The wallet changed while preparing this transaction. Review it again before paying.");
  }
  const prepared = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
  const message = getCompiledTransactionMessageDecoder().decode(prepared.messageBytes);
  if (message.version !== version || message.staticAccounts[0] !== walletAddress) {
    throw new Error("The prepared transaction does not match the selected wallet or transaction version.");
  }
  const [signature] = await signer.signAndSendTransactions([prepared]);
  if (signature?.length !== 64) throw new Error("The wallet did not return a signature. Check the payment status.");
  return getBase58Decoder().decode(signature);
}

export function WalletControl({
  session,
  refresh,
  checkingAccount = false,
}: {
  session: Session | null;
  refresh: () => Promise<void>;
  checkingAccount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const cluster = session?.cluster === "devnet" ? "devnet" : "mainnet";
  const client = solanaWalletClients[cluster];
  const ready = useIsWalletReady(client);
  const connected = useConnectedWallet(client);
  const wallets = useWallets(client).filter((wallet) =>
    session?.profile ? wallet.features.includes(SolanaSignAndSendTransaction) : canAuthenticateWallet(wallet),
  );

  useEffect(() => {
    if (session?.enabled) registerMobileWallet(`solana:${cluster}`);
  }, [cluster, session?.enabled]);

  function closeWallet() {
    setOpen(false);
    trigger.current?.focus();
  }

  const connect = useAction(async (abortSignal, wallet: (typeof wallets)[number]) => {
    const options = { abortSignal };
    const accounts = await client.wallet.connect(wallet, options);
    abortSignal.throwIfAborted();
    const chainAccounts = accounts.filter((account) => account.chains.includes(`solana:${cluster}`));
    if (session?.profile) {
      const account = chainAccounts.find((item) => item.address === session.profile?.wallet);
      if (!account) throw new Error("Select the same account and network you used to sign in.");
      client.wallet.selectAccount(account);
      closeWallet();
      return;
    }
    const account = chainAccounts[0];
    if (!account) throw new Error(`Select an account that supports Solana ${cluster}.`);
    client.wallet.selectAccount(account);
    const { input, message } = await request<{ input: SolanaSignInInput; message: string }>("challenge", {
      wallet: account.address,
    });

    let signature: readonly number[];
    let signedMessage: readonly number[] | undefined;
    let signedMessageFormat: SolanaSignInOutput["signedMessageFormat"];
    // Mobile Wallet Adapter can reuse authorization that predates this challenge.
    const nativeSignIn = wallet.features.includes(SolanaSignIn) && !isMobileAdapter(wallet.name);
    const offchainSignIn = nativeSignIn && supportsSignInWithOffchainMessage(wallet);
    const canSignOffchain = account.features.includes(SolanaSignOffchainMessage);
    if (nativeSignIn && (offchainSignIn || !canSignOffchain)) {
      const output = await client.wallet.signIn(
        wallet,
        offchainSignIn ? { ...input, useOffchainMessage: { messageVersion: 1 } } : input,
        options,
      );
      if (output.account.address !== account.address)
        throw new Error("The wallet signed in with a different address.");
      signature = [...output.signature];
      signedMessage = [...output.signedMessage];
      if (output.signedMessageFormat?.kind === "offchainMessage")
        signedMessageFormat = output.signedMessageFormat;
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
    await request("verify", {
      wallet: account.address,
      signature,
      signedMessage,
      signedMessageFormat,
      invite: sessionStorage.getItem("sonnely.invite") ?? undefined,
    });
    sessionStorage.removeItem("sonnely.invite");
    await refresh();
    closeWallet();
  });

  const disconnect = useAction(async (abortSignal) => {
    await request("logout", {});
    await client.wallet.disconnect(undefined, { abortSignal }).catch(() => {});
    await refresh();
    closeWallet();
  });
  const busy = connect.isRunning || disconnect.isRunning;
  const error = disconnect.error ?? connect.error;
  const failure = busy || !error ? "" : error instanceof Error ? error.message : "Wallet action failed.";

  const walletLabel = session?.profile
    ? shorten(session.profile.wallet)
    : checkingAccount
      ? "Checking wallet…"
      : "Connect wallet";

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
        aria-label={session?.profile ? `${walletLabel}, wallet options` : walletLabel}
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
          {session?.enabled ? (
            <>
              <strong>{session.profile ? "Wallet connection" : "Solana wallets"}</strong>
              {session.profile && connected?.account.address === session.profile.wallet && (
                <p className="muted">Connected to {connected.wallet.name}</p>
              )}
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
              {session.profile && (
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
            </>
          ) : (
            <p>{session ? "Wallet sign-in is temporarily unavailable." : "Checking account service…"}</p>
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
