"use client";

import { useEffect, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import { Wallet as WalletIcon, ChevronDown } from "lucide-react";
import { shorten } from "@/lib/models";

export type Session = {
  profile: { wallet: string; name: string; balance: number; referral: string } | null;
  enabled: boolean;
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

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [failure, setFailure] = useState("");
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
  return { session, failure, refresh };
}

export function WalletControl({
  session,
  refresh,
}: {
  session: Session | null;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState<ReturnType<ReturnType<typeof getWallets>["get"]>>([]);

  useEffect(() => {
    const registry = getWallets();
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

  async function connect(wallet: (typeof wallets)[number]) {
    setFailure("");
    setBusy(true);
    try {
      const features = wallet.features as StandardConnectFeature & SolanaSignMessageFeature;
      const { accounts } = await features[StandardConnect].connect();
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
      setOpen(false);
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
      setOpen(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wallet-widget">
      <button
        type="button"
        className="button wallet-button"
        aria-expanded={open}
        onClick={() => {
          setFailure("");
          setOpen(!open);
        }}
      >
        <WalletIcon size={16} />
        {session?.profile ? shorten(session.profile.wallet) : "Connect wallet"}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="wallet-pop panel">
          {session?.profile ? (
            <button className="button quiet full" type="button" disabled={busy} onClick={disconnect}>
              Sign out
            </button>
          ) : session?.enabled ? (
            <>
              <strong>Solana wallets</strong>
              {wallets.length ? (
                wallets.map((wallet) => (
                  <button
                    className="button quiet full"
                    type="button"
                    key={wallet.name}
                    onClick={() => connect(wallet)}
                    disabled={busy}
                  >
                    <span>{wallet.name}</span>
                  </button>
                ))
              ) : (
                <p>Open this page in a Solana wallet browser or install a compatible wallet extension.</p>
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
