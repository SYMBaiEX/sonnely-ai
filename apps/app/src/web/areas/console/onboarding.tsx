// spec/app/console/index.md, "Story: Set up the workspace profile"
import { Activity, ArrowLeft, ArrowRight, Check, KeyRound, MessageSquare, Wallet, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Console } from "../../../../gen/app__console.ts";
import { Alert, Button, Dialog, DialogContent, DialogTitle, Input } from "@repo/ui";
import { Brand, ThemeSwitch, type Theme } from "../site/chrome.tsx";
import { TermsAcceptance } from "./terms-acceptance.tsx";
import { WalletControl } from "./wallet.tsx";

const tour = [
  { name: "Playground", detail: "Compare models and send a private inference request.", href: "/console/chat", Icon: MessageSquare },
  { name: "Usage", detail: "See tokens, charges, and request references.", href: "/console/usage", Icon: Activity },
  { name: "API keys", detail: "Connect your app with a key and a budget.", href: "/console/keys", Icon: KeyRound },
] as const;

function focusHeading(element: HTMLHeadingElement | null) {
  element?.focus();
}

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
    const finished = await onFinish(funding);
    if (!finished) {
      setBusy(false);
      setError("Could not save your setup choice. Check your connection and try again.");
      return;
    }
    close();
    window.location.assign(href);
  }

  const heading = {
    wallet: "Set up your workspace",
    terms: "Review the terms",
    profile: "What should we call you?",
    funding: canFund ? "Add your first credits" : "You’re ready to explore",
    tour: active.name,
  }[step];

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !busy) close();
    }}>
      <DialogContent hideClose data-onboarding-dialog className="max-w-none gap-0 overflow-auto p-0">
      <div data-onboarding-shell>
        <aside data-onboarding-scene aria-hidden="true" inert>
          <div data-onboarding-brand>
            <Brand href="/console/chat" />
          </div>
          <div data-onboarding-stage>
            <div data-onboarding-orbit>
              <div data-onboarding-orbit-core>
                <ActiveIcon size={36} strokeWidth={1.4} />
              </div>
            </div>
            <div data-onboarding-nodes>
              {tour.map(({ name, Icon }, index) => (
                <div key={name} data-current={index === page}>
                  <Icon size={15} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div data-onboarding-content>
          <header data-onboarding-toolbar>
            <ol aria-label="Setup progress" data-onboarding-progress>
              {["Connect", "Profile", "Get started"].map((label, index) => (
                <li key={label} aria-current={index === progress ? "step" : undefined} data-done={index < progress}>
                  {index < progress && <Check size={12} aria-hidden />}
                  {label}
                </li>
              ))}
            </ol>
            <div data-onboarding-toolbar-controls>
              <ThemeSwitch choose={(next) => void onChooseTheme(next)} />
              <Button data-onboarding-close variant="ghost" size="icon" type="button" onClick={close} disabled={busy} aria-label="Close setup">
                <X size={19} />
              </Button>
            </div>
          </header>
          <div data-onboarding-step key={step}>
            <DialogTitle tabIndex={-1} ref={focusHeading}>
              {heading}
            </DialogTitle>
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
              <form data-onboarding-form onSubmit={(event) => void saveProfile(event)}>
                <p>Give your console a personal touch. You can change this anytime in Settings.</p>
                <label>
                  Display name <span className="text-meta text-muted-foreground">Optional</span>
                  <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="nickname" placeholder="Your name" />
                </label>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Continue"} <ArrowRight size={16} aria-hidden />
                </Button>
              </form>
            )}
            {step === "funding" && (
              <>
                <p>
                  {canFund
                    ? "Choose a credit amount in Billing. You’ll review the asset, amount, and network before signing in your wallet."
                    : "Open the Playground to try a model, then create a budgeted key when you’re ready to build."}
                </p>
                <div data-onboarding-actions>
                  {canFund && (
                    <Button type="button" disabled={busy} onClick={() => void finish("fund", "/console/billing#buy-credits")}>
                      <Wallet size={16} aria-hidden /> Add credits
                    </Button>
                  )}
                  <Button variant={canFund ? "outline" : "primary"} type="button" disabled={busy} onClick={() => setScreen("tour")}>
                    {canFund ? "Explore first" : "Take the tour"} <ArrowRight size={16} aria-hidden />
                  </Button>
                </div>
              </>
            )}
            {step === "tour" && (
              <>
                <p key={page} data-onboarding-tour-note>
                  {active.detail}
                </p>
                <div data-onboarding-tour-nav aria-label="Tour stops">
                  {tour.map(({ name, Icon }, index) => (
                    <Button key={name} variant="ghost" type="button" aria-pressed={index === page} onClick={() => setPage(index)}>
                      <Icon size={16} aria-hidden /> {name}
                    </Button>
                  ))}
                </div>
                <div data-onboarding-actions>
                  <Button type="button" disabled={busy} onClick={() => void finish("later", active.href)}>
                    Open {active.name} <ArrowRight size={16} aria-hidden />
                  </Button>
                  {canFund && (
                    <Button variant="outline" type="button" onClick={() => setScreen("funding")}>
                      <ArrowLeft size={16} aria-hidden /> Back
                    </Button>
                  )}
                </div>
              </>
            )}
            {error && (
              <Alert variant="destructive">
                {error}
              </Alert>
            )}
          </div>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
