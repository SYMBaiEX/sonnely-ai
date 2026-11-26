// spec/app/console/index.md, "Story: Set up the workspace profile"
import { Activity, ArrowLeft, ArrowRight, Check, KeyRound, MessageSquare, Wallet, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Console } from "../../../../gen/app__console.ts";
import { ThemeSwitch, type Theme } from "../site/chrome.tsx";
import { TermsAcceptance } from "./terms-acceptance.tsx";
import { WalletControl } from "./wallet.tsx";

const tour = [
  { name: "Playground", detail: "Compare models and send a private inference request.", href: "/console/chat", Icon: MessageSquare },
  { name: "Usage", detail: "See tokens, charges, and request references.", href: "/console/usage", Icon: Activity },
  { name: "API keys", detail: "Connect your app with a key and a budget.", href: "/console/keys", Icon: KeyRound },
] as const;

export function Onboarding({
  wallet,
  settings,
  cluster,
  canFund,
  termsRequired = false,
  onSignIn,
  onSignOut,
  onSaveProfile,
  onAcceptTerms,
  onFinish,
  onChooseTheme,
  close,
}: {
  wallet?: string;
  settings: Console | undefined;
  cluster: "mainnet" | "devnet";
  canFund: boolean;
  termsRequired?: boolean;
  onSignIn: (wallet: string) => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
  onSaveProfile: (name: string, username: string) => Promise<boolean>;
  onAcceptTerms: () => Promise<boolean>;
  onFinish: (funding: "fund" | "later") => Promise<boolean>;
  onChooseTheme: (theme: Theme) => Promise<boolean>;
  close: () => void;
}) {
  const [screen, setScreen] = useState<"profile" | "funding" | "tour">("profile");
  const [page, setPage] = useState(0);
  const [name, setName] = useState(settings?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const step = !wallet ? "wallet" : termsRequired ? "terms" : screen;
  const progress = step === "wallet" || step === "terms" ? 0 : step === "profile" ? 1 : 2;
  const active = tour[page];
  const ActiveIcon = active.Icon;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== settings?.name && !(await onSaveProfile(trimmed, settings?.username ?? ""))) {
        throw new Error("Could not save your profile.");
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
      await onFinish(funding);
    } finally {
      close();
      window.location.assign(href);
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
      ref={(element) => {
        if (element && !element.open) element.showModal();
      }}
      className="onboarding-dialog"
      aria-labelledby="onboarding-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="onboarding-shell">
        <aside className="onboarding-scene" aria-hidden="true">
          <div className="onboarding-brand">
            <span className="brand-icon" />
            <span className="brand-wordmark" />
          </div>
          <div className="onboarding-stage">
            <div className="onboarding-orbit">
              <div className="onboarding-orbit-core">
                <ActiveIcon size={36} strokeWidth={1.4} />
              </div>
            </div>
            <div className="onboarding-nodes">
              {tour.map(({ name, Icon }, index) => (
                <div key={name} data-current={index === page}>
                  <Icon size={15} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div className="onboarding-content">
          <header className="onboarding-toolbar">
            <ol aria-label="Setup progress" className="onboarding-progress">
              {["Connect", "Profile", "Get started"].map((label, index) => (
                <li key={label} aria-current={index === progress ? "step" : undefined} data-done={index < progress}>
                  {index < progress && <Check size={12} aria-hidden />}
                  {label}
                </li>
              ))}
            </ol>
            <div className="onboarding-toolbar-controls">
              <ThemeSwitch choose={(next) => void onChooseTheme(next)} />
              <button className="onboarding-close" type="button" onClick={close} disabled={busy} aria-label="Close setup">
                <X size={19} />
              </button>
            </div>
          </header>
          <div className="onboarding-step" key={step}>
            <h2
              id="onboarding-title"
              tabIndex={-1}
              ref={(element) => {
                element?.focus();
              }}
            >
              {heading}
            </h2>
            {step === "wallet" && (
              <>
                <p>A Solana wallet signs you in. You can try a sample before buying credits.</p>
                <WalletControl cluster={cluster} onSignIn={onSignIn} onSignOut={onSignOut} />
              </>
            )}
            {step === "terms" && (
              <>
                <p>Accept the current terms to fund your balance and run live inference.</p>
                <TermsAcceptance accept={onAcceptTerms} inSetup />
              </>
            )}
            {step === "profile" && (
              <form className="onboarding-form" onSubmit={saveProfile}>
                <p>Give your console a personal touch. You can change this anytime in Settings.</p>
                <label>
                  Display name <span className="caption">Optional</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="nickname" placeholder="Your name" />
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
                <div className="onboarding-actions">
                  {canFund && (
                    <button className="button accent" type="button" disabled={busy} onClick={() => void finish("fund", "/console/billing#buy-credits")}>
                      <Wallet size={16} aria-hidden /> Add credits
                    </button>
                  )}
                  <button className={`button ${canFund ? "quiet" : "accent"}`} type="button" disabled={busy} onClick={() => setScreen("tour")}>
                    {canFund ? "Explore first" : "Take the tour"} <ArrowRight size={16} aria-hidden />
                  </button>
                </div>
              </>
            )}
            {step === "tour" && (
              <>
                <p key={page} className="onboarding-tour-note">
                  {active.detail}
                </p>
                <div className="onboarding-tour-nav" aria-label="Tour stops">
                  {tour.map(({ name, Icon }, index) => (
                    <button key={name} type="button" aria-pressed={index === page} onClick={() => setPage(index)}>
                      <Icon size={16} aria-hidden /> {name}
                    </button>
                  ))}
                </div>
                <div className="onboarding-actions">
                  <button className="button accent" type="button" disabled={busy} onClick={() => void finish("later", active.href)}>
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
