"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, ArrowRight, Check, KeyRound, MessageSquare, Wallet, X } from "lucide-react";
import { TermsAcceptance } from "./terms-acceptance";
import { request, WalletControl, type Session } from "./wallet";
import { ThemeSwitch } from "./appearance";
import { BrandMark, BrandWordmark } from "./brand";
import styles from "./onboarding.module.css";

const tour = [
  {
    name: "Playground",
    detail: "Compare models and send a private inference request.",
    href: "/console",
    Icon: MessageSquare,
  },
  {
    name: "Usage",
    detail: "See tokens, charges, and request references.",
    href: "/console/usage",
    Icon: Activity,
  },
  {
    name: "API keys",
    detail: "Connect your app with a key and a budget.",
    href: "/console/keys",
    Icon: KeyRound,
  },
] as const;

export function Onboarding({
  session,
  refresh,
  close,
}: {
  session: Session;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [screen, setScreen] = useState<"profile" | "funding" | "tour">("profile");
  const [page, setPage] = useState(0);
  const [name, setName] = useState(session.profile?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const profile = session.profile;
  const step = !profile ? "wallet" : session.termsRequired ? "terms" : screen;
  const progress = step === "wallet" || step === "terms" ? 0 : step === "profile" ? 1 : 2;
  const active = tour[page];
  const ActiveIcon = active.Icon;
  const canFund = session.billingEnabled && (profile?.balance ?? 0) === 0;

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    title.current?.focus();
  }, [step]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (name.trim() && name.trim() !== profile?.name) {
        await request("profile", { name: name.trim() });
        await refresh();
      }
      setScreen("funding");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(funding: "fund" | "later", href: string) {
    setBusy(true);
    setError("");
    try {
      if (profile?.onboarding === "pending") {
        await request("finish-onboarding", { funding });
        await refresh();
      }
      close();
      router.push(href);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your setup.");
    } finally {
      setBusy(false);
    }
  }

  const heading = {
    wallet: "Set up your workspace",
    terms: "Review the terms",
    profile: "What should we call you?",
    funding: canFund ? "Add your first credits" : "You’re ready to explore",
    tour: active.name,
  }[step];

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="onboarding-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <div className={styles.shell}>
        <aside className={styles.scene} aria-hidden="true">
          <div className={styles.brand}>
            <BrandMark />
            <BrandWordmark />
          </div>
          <div className={styles.stage}>
            <div className={styles.orbit}>
              <div className={styles.orbitCore}>
                <ActiveIcon size={36} strokeWidth={1.4} />
              </div>
            </div>
            <div className={styles.nodes}>
              {tour.map(({ name, Icon }, index) => (
                <div key={name} data-current={index === page}>
                  <Icon size={15} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div className={styles.content}>
          <header className={styles.toolbar}>
            <ol aria-label="Setup progress" className={styles.progress}>
              {["Connect", "Profile", "Get started"].map((label, index) => (
                <li
                  key={label}
                  aria-current={index === progress ? "step" : undefined}
                  data-done={index < progress}
                >
                  {index < progress && <Check size={12} aria-hidden />}
                  {label}
                </li>
              ))}
            </ol>
            <div className={styles.toolbarControls}>
              <ThemeSwitch />
              <button
                className={styles.close}
                type="button"
                onClick={close}
                disabled={busy}
                aria-label="Close setup"
              >
                <X size={19} />
              </button>
            </div>
          </header>
          <div className={styles.step} key={step}>
            <h2 id="onboarding-title" ref={title} tabIndex={-1}>
              {heading}
            </h2>
            {step === "wallet" && (
              <>
                <p>A Solana wallet signs you in. You can try a sample before buying credits.</p>
                <WalletControl session={session} refresh={refresh} />
              </>
            )}
            {step === "terms" && (
              <>
                <p>Accept the current terms to fund your balance and run live inference.</p>
                <TermsAcceptance refresh={refresh} inSetup />
              </>
            )}
            {step === "profile" && (
              <form className={styles.form} onSubmit={saveProfile}>
                <p>Give your console a personal touch. You can change this anytime in Settings.</p>
                <label>
                  Display name <span className="caption">Optional</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={60}
                    autoComplete="nickname"
                    placeholder="Your name"
                  />
                </label>
                <button className="button accent" disabled={busy}>
                  {busy ? "Saving…" : "Continue"} <ArrowRight size={16} aria-hidden />
                </button>
              </form>
            )}
            {step === "funding" && (
              <>
                <p>
                  {canFund
                    ? "Choose a credit amount in Billing. You’ll review the asset, amount, and network before signing in your wallet."
                    : "Open the Playground to try a model, then create a budgeted key when you’re ready to build."}
                </p>
                <div className={styles.actions}>
                  {canFund && (
                    <button
                      className="button accent"
                      type="button"
                      disabled={busy}
                      onClick={() => void finish("fund", "/console/billing#buy-credits")}
                    >
                      <Wallet size={16} aria-hidden /> Add credits
                    </button>
                  )}
                  <button
                    className={`button ${canFund ? "quiet" : "accent"}`}
                    type="button"
                    disabled={busy}
                    onClick={() => setScreen("tour")}
                  >
                    {canFund ? "Explore first" : "Take the tour"} <ArrowRight size={16} aria-hidden />
                  </button>
                </div>
              </>
            )}
            {step === "tour" && (
              <>
                <p key={page} className={styles.tourNote}>
                  {active.detail}
                </p>
                <div className={styles.tourNav} aria-label="Tour stops">
                  {tour.map(({ name, Icon }, index) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={index === page}
                      onClick={() => setPage(index)}
                    >
                      <Icon size={16} aria-hidden /> {name}
                    </button>
                  ))}
                </div>
                <div className={styles.actions}>
                  <button
                    className="button accent"
                    type="button"
                    disabled={busy}
                    onClick={() => void finish("later", active.href)}
                  >
                    Open {active.name} <ArrowRight size={16} aria-hidden />
                  </button>
                  {canFund && (
                    <button className="button quiet" type="button" onClick={() => setScreen("funding")}>
                      <ArrowLeft size={16} aria-hidden /> Back
                    </button>
                  )}
                </div>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
