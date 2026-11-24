"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { getWallets } from "@wallet-standard/app";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import bs58 from "bs58";
import { Wallet as WalletIcon, ChevronDown } from "lucide-react";
import { shorten } from "@/lib/models";

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

let mobileRegistration: Promise<void> | undefined;

function registerMobileWallet() {
  if (!window.isSecureContext || !/Android/i.test(navigator.userAgent)) return;
  mobileRegistration ??= import("@solana-mobile/wallet-standard-mobile")
    .then(({ registerMwa, createDefaultAuthorizationCache, createDefaultChainSelector }) => {
      registerMwa({
        appIdentity: { name: "Sonnely", uri: window.location.origin, icon: "/brand/sonnely-crimson-192.png" },
        chains: ["solana:mainnet", "solana:devnet"],
        authorizationCache: createDefaultAuthorizationCache(),
        chainSelector: createDefaultChainSelector(),
      });
    })
    .catch(() => {
      mobileRegistration = undefined;
    });
}

export async function payWithWallet(
  walletAddress: string,
  reference: string,
  cluster: string,
  task = "payment-transaction",
) {
  if (cluster !== "mainnet" && cluster !== "devnet") throw new Error("Unsupported Solana network.");
  const chain = `solana:${cluster}` as const;
  for (const wallet of getWallets().get()) {
    const account = wallet.accounts.find(
      (item) => item.address === walletAddress && item.chains.includes(chain),
    );
    const feature = (wallet.features as Partial<SolanaSignAndSendTransactionFeature>)[
      SolanaSignAndSendTransaction
    ];
    if (!account || !feature || !account.features.includes(SolanaSignAndSendTransaction)) continue;
    const versions = feature.supportedTransactionVersions;
    const version = versions.includes("legacy") ? "legacy" : versions.includes(0) ? 0 : undefined;
    if (version === undefined || (task === "admin-payout-transaction" && version !== "legacy")) continue;
    const { transaction } = await request<{ transaction: string }>(task, {
      reference,
      version,
    });
    const [sent] = await feature.signAndSendTransaction({
      account,
      chain,
      transaction: Uint8Array.from(atob(transaction), (byte) => byte.charCodeAt(0)),
      options: { preflightCommitment: "confirmed", skipPreflight: false },
    });
    if (!sent) throw new Error("The wallet did not return a signature. Check the payment status.");
    return bs58.encode(sent.signature);
  }
  throw new Error("Reconnect your signed-in wallet from the console header, or use the Solana Pay link.");
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
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState<ReturnType<ReturnType<typeof getWallets>["get"]>>([]);

  useEffect(() => {
    const registry = getWallets();
    registerMobileWallet();
    const update = () =>
      setWallets(
        registry
          .get()
          .filter(
            (wallet) =>
              wallet.chains.some((chain) => chain.startsWith("solana:")) &&
              StandardConnect in wallet.features &&
              SolanaSignMessage in wallet.features,
          ),
      );
    update();
    const onRegister = registry.on("register", update);
    const onUnregister = registry.on("unregister", update);
    return () => {
      onRegister();
      onUnregister();
    };
  }, []);

  function closeWallet() {
    setOpen(false);
    trigger.current?.focus();
  }

  async function connect(wallet: (typeof wallets)[number]) {
    setFailure("");
    setBusy(true);
    try {
      const features = wallet.features as StandardConnectFeature & SolanaSignMessageFeature;
      const { accounts } = await features[StandardConnect].connect();
      if (session?.profile) {
        if (!accounts.some((item) => item.address === session.profile?.wallet))
          throw new Error("Select the same address you used to sign in.");
        closeWallet();
        return;
      }
      const account = accounts.find((item) => item.chains.some((chain) => chain.startsWith("solana:")));
      if (!account) throw new Error("No Solana account is available in this wallet.");
      const { message } = await request<{ message: string }>("challenge", { wallet: account.address });
      const [signed] = await features[SolanaSignMessage].signMessage({
        account,
        message: new TextEncoder().encode(message),
      });
      if (!signed) throw new Error("No signature was returned.");
      await request("verify", {
        wallet: account.address,
        signature: [...signed.signature],
        invite: sessionStorage.getItem("sonnely.invite") ?? undefined,
      });
      sessionStorage.removeItem("sonnely.invite");
      await refresh();
      closeWallet();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setFailure("");
    try {
      await request("logout", {});
      await refresh();
      closeWallet();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

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
        onClick={() => {
          setFailure("");
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
              <strong>{session.profile ? "Reconnect for payments" : "Solana wallets"}</strong>
              {wallets.length ? (
                wallets.map((wallet) => (
                  <button
                    className="button quiet full"
                    type="button"
                    key={wallet.name}
                    onClick={() => connect(wallet)}
                    disabled={busy}
                  >
                    {wallet.name === "Mobile Wallet Adapter" ? "Solana mobile wallet" : wallet.name}
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
                <button className="button quiet full" type="button" disabled={busy} onClick={disconnect}>
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
