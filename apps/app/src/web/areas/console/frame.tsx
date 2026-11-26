// spec/app/console/index.md: the frame every console section shares — the section rail, the session-aware
// header and the sign-in state the sections gate themselves on.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Fragment } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Cpu,
  Files,
  KeyRound,
  LifeBuoy,
  List,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { Section } from "../../../../gen/app__nav.ts";
import type { Console as ConsoleSettings, Theme as ConsoleTheme } from "../../../../gen/app__console.ts";
import { balanceOf, type Ledger } from "../../../../gen/app__billing__ledger.ts";
import type { Referrals as ReferralState } from "../../../../gen/app__admin__referrals.ts";
import type { Registry as AdminRegistry } from "../../../../gen/app__admin.ts";
import type { Crm } from "../../../../gen/app__admin__crm.ts";
import { useRemote, type Remote } from "../../remote.ts";
import { useSession, type SessionSnapshot, type WorkspaceSession } from "../../session.ts";
import { Brand, ShellRules, ThemeSwitch, accentTokenAliases, setTheme as applyTheme, useAmbientMotion, useTheme, type Theme } from "../site/chrome.tsx";
import { AmbientVisualizer } from "../site/motion.tsx";
import { creditBalance, shorten } from "./bits.tsx";
import { CommandMenu } from "./command-menu.tsx";
import { Onboarding } from "./onboarding.tsx";
import { TermsAcceptance, termsVersion } from "./terms-acceptance.tsx";
import { useBillingCluster, WalletControl } from "./wallet.tsx";
import "./console.css";

export type { WorkspaceSession };

/** The sections the rail links to, in the legacy console's groups. */
const groups = [
  {
    label: "Inference",
    items: [
      { section: "Chat" as Section, id: "chat", title: "Playground", path: "/console/chat", Icon: MessageSquare },
      { section: "Catalog" as Section, id: "models", title: "Models", path: "/console/models", Icon: Cpu },
      { section: "Keys" as Section, id: "keys", title: "API keys", path: "/console/keys", Icon: KeyRound },
      { section: "Usage" as Section, id: "usage", title: "Usage", path: "/console/usage", Icon: Activity },
      { section: "Logs" as Section, id: "logs", title: "Request logs", path: "/console/logs", Icon: List },
      { section: "Batch" as Section, id: "batch", title: "Batch", path: "/console/batch", Icon: Files },
    ],
  },
  {
    label: "Workspace",
    items: [
      { section: "Billing" as Section, id: "billing", title: "Billing", path: "/console/billing", Icon: Wallet },
      { section: "Teams" as Section, id: "teams", title: "Teams", path: "/console/teams", Icon: Users },
      { section: "Referrals" as Section, id: "referrals", title: "Referrals", path: "/console/referrals", Icon: Users },
      { section: "Support" as Section, id: "support", title: "Support", path: "/console/support", Icon: LifeBuoy },
      { section: "Admin" as Section, id: "admin", title: "Admin", path: "/console/admin", Icon: ShieldCheck },
      { section: "Settings" as Section, id: "settings", title: "Settings", path: "/console/settings", Icon: Settings },
    ],
  },
];

const all = groups.flatMap((group) => group.items);

function walletBalance(ledger: Ledger | undefined, wallet: string) {
  return ledger ? balanceOf(ledger, wallet) : 0;
}

function machineTheme(theme: Theme): ConsoleTheme {
  return theme === "light" ? "Light" : theme === "system" ? "System" : "Dark";
}

const operatorRoles = { Admin: "admin", Support: "support", Finance: "finance", Member: "member" } as const;

export interface ConsoleProfile {
  wallet: string;
  name: string;
  username: string;
  balance: number;
  referral: string;
  role: "member" | "admin" | "support" | "finance";
}

export type WorkspaceSessionRemote = SessionSnapshot;

export interface ConsoleShell {
  session: WorkspaceSessionRemote;
  settings: Remote<ConsoleSettings>;
  ledger: Remote<Ledger>;
  referrals: Remote<ReferralState>;
  crm: Remote<Crm>;
  profile: ConsoleProfile | null;
  termsRequired: boolean;
  theme: Theme;
  motion: boolean;
  signIn: (wallet: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  saveProfile: (name: string, username: string) => Promise<boolean>;
  acceptTerms: () => Promise<boolean>;
  finishOnboarding: (funding: "fund" | "later") => Promise<boolean>;
  chooseTheme: (theme: Theme) => Promise<boolean>;
}

export const ConsoleShellContext = createContext<ConsoleShell | null>(null);

export function useConsoleShell() {
  const shell = useContext(ConsoleShellContext);
  if (!shell) throw new Error("console shell surfaces render inside ConsoleFrame");
  return shell;
}

/** The console frame: section rail on the left, session-aware header, and the section's own content. */
export function ConsoleFrame({ section, children }: { section: Section; children: ReactNode }) {
  const session = useSession();
  const settings = useRemote<ConsoleSettings>("console");
  const ledger = useRemote<Ledger>("billing-ledger");
  const referrals = useRemote<ReferralState>("admin-referrals");
  const admin = useRemote<AdminRegistry>("admin");
  const crm = useRemote<Crm>("admin-crm");
  const theme = useTheme();
  const motion = useAmbientMotion();
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [dismissedWallet, setDismissedWallet] = useState<string>();
  const navToggle = useRef<HTMLButtonElement>(null);
  const navPanel = useRef<HTMLElement>(null);
  const selected = all.find((item) => item.section === section) ?? all[0];
  const signedIn = session.state?.tag === "SignedIn" ? session.state.wallet : "";
  const referral = signedIn ? referrals.state?.codes.find((code) => code.owner === signedIn)?.code ?? "" : "";
  const roster = admin.state?.ops.roster;
  const operator = signedIn ? roster?.find((row) => row.wallet === signedIn) : undefined;
  const bootstrapOperator = Boolean(signedIn && admin.state && roster?.length === 0);
  const role: ConsoleProfile["role"] = operator ? operatorRoles[operator.role] : bootstrapOperator ? "admin" : "member";
  const crmProfile = signedIn ? crm.state?.profiles.find((row) => row.wallet === signedIn) : undefined;
  const termsRequired = Boolean(signedIn) && crm.state !== undefined && crmProfile?.termsVersion !== termsVersion;
  const profile: ConsoleProfile | null = signedIn
    ? {
        wallet: signedIn,
        name: settings.state?.name ?? "",
        username: settings.state?.username ?? "",
        balance: walletBalance(ledger.state, signedIn),
        referral,
        role,
      }
    : null;
  const serviceEnabled = session.state !== undefined;
  const checkingAccount = session.state === undefined && !session.error;
  const cluster = useBillingCluster();

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setPalette((isOpen) => !isOpen);
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const panel = navPanel.current;
    (panel?.querySelector<HTMLAnchorElement>("[aria-current='page']") ?? panel?.querySelector<HTMLAnchorElement>("nav a"))?.focus();
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") closeNavigation();
    }
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [navOpen]);

  function closeNavigation() {
    setNavOpen(false);
    navToggle.current?.focus();
  }

  function toggleNavigation(trigger: HTMLButtonElement) {
    navToggle.current = trigger;
    if (navOpen) closeNavigation();
    else setNavOpen(true);
  }

  async function signIn(wallet: string) {
    const state = await session.refresh();
    return state?.tag === "SignedIn" && state.wallet === wallet;
  }

  async function signOut() {
    return session.send({ type: "signOut" });
  }

  async function saveCrmProfile(fields: Partial<{ name: string; username: string; onboarding: string; termsVersion: string; termsAcceptedAt: number }>) {
    if (!signedIn) return false;
    const now = Date.now();
    return crm.send({
      type: "saveProfile",
      wallet: signedIn,
      name: fields.name ?? crmProfile?.name ?? "",
      username: fields.username ?? crmProfile?.username ?? "",
      joined: crmProfile?.joined ?? now,
      onboarding: fields.onboarding ?? crmProfile?.onboarding ?? "pending",
      termsVersion: fields.termsVersion ?? crmProfile?.termsVersion ?? "",
      termsAcceptedAt: fields.termsAcceptedAt ?? crmProfile?.termsAcceptedAt ?? 0,
      inviter: crmProfile?.inviter ?? "",
      now,
    });
  }

  async function saveProfile(name: string, username: string) {
    const deviceChanged = name !== settings.state?.name || username !== settings.state?.username;
    if (deviceChanged && !(await settings.send({ type: "saveProfile", name, username }))) return false;
    return saveCrmProfile({ name, username });
  }

  async function acceptTerms() {
    if (crmProfile?.termsVersion === termsVersion) return true;
    return saveCrmProfile({ termsVersion, termsAcceptedAt: Date.now() });
  }

  async function finishOnboarding(funding: "fund" | "later") {
    return saveCrmProfile({ onboarding: funding });
  }

  async function chooseTheme(next: Theme) {
    applyTheme(next);
    const changed = settings.state?.theme !== machineTheme(next);
    return !changed || settings.send({ type: "chooseTheme", theme: machineTheme(next) });
  }

  const shell: ConsoleShell = {
    session,
    settings,
    ledger,
    referrals,
    crm,
    profile,
    termsRequired,
    theme,
    motion,
    signIn,
    signOut,
    saveProfile,
    acceptTerms,
    finishOnboarding,
    chooseTheme,
  };
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== "admin" || (profile?.role ?? "member") !== "member"),
    }))
    .filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const PageIcon = selected.Icon;
  const inviteUrl = profile?.referral ? `${window.location.origin}/console?ref=${profile.referral}` : undefined;
  const showSetup = Boolean(serviceEnabled && (setupOpen || (signedIn && crmProfile?.onboarding === "pending" && signedIn !== dismissedWallet)));
  const sidebar = (items: typeof all) =>
    items.map(({ id, title, path, Icon }) => (
      <a key={id} href={path} onClick={() => setNavOpen(false)} aria-current={id === selected.id ? "page" : undefined}>
        <Icon size={18} aria-hidden="true" />
        <span>{title}</span>
      </a>
    ));

  return (
    <div className="theme-root site" data-area="console" data-theme={theme} data-motion={motion ? "on" : "off"} style={accentTokenAliases}>
      <div className="console">
      <ShellRules />
      <a href="#console-content" className="skip">
        Skip to workspace
      </a>
      <div className="workspace-scene" aria-hidden="true" />
      <aside ref={navPanel} id="console-navigation" className={"rail glass" + (navOpen ? " rail-open" : "")}>
        <div className="rail-top">
          <Brand />
          <p className="mono rail-caption">Developer console</p>
        </div>
        <a className="rail-identity" href="/console/settings" onClick={() => setNavOpen(false)}>
          <span className="rail-identity-icon">
            <Wallet size={17} aria-hidden="true" />
          </span>
          <span>
            <strong>{profile ? profile.name || shorten(profile.wallet) : "Your workspace"}</strong>
            <small>{profile?.role === "admin" ? "Administrator" : profile ? "Solana wallet connected" : "Solana wallet access"}</small>
          </span>
        </a>
        <nav aria-label="Workspace navigation" className="rail-nav">
          {visibleGroups.map((group) => (
            <Fragment key={group.label}>
              <p className="mono">{group.label}</p>
              {sidebar(group.items)}
            </Fragment>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="rail-theme">
            <ThemeSwitch choose={(next) => void chooseTheme(next)} />
          </span>
          {serviceEnabled && (
            <button type="button" className="button quiet small" onClick={() => setSetupOpen(true)}>
              <Sparkles size={16} aria-hidden /> Workspace setup
            </button>
          )}
          <a href="/docs">
            <BookOpen size={17} /> Documentation <ArrowUpRight size={13} />
          </a>
          <a href="/contact">
            <CircleHelp size={17} /> Contact us <ArrowUpRight size={13} />
          </a>
          <a className="balance" href="/console/billing">
            <span>Credit balance</span>
            <b>{profile ? creditBalance(profile.balance) : "—"}</b>
          </a>
        </div>
      </aside>
      {navOpen && <button type="button" className="nav-scrim" tabIndex={-1} aria-label="Close navigation" onClick={closeNavigation} />}
      <div className="console-stage">
        <header className="console-bar glass">
          <div className="crumb">
            <span className="compact-brand">
              <Brand />
            </span>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong className="crumb-page">
              <PageIcon size={15} aria-hidden="true" /> {selected.title}
            </strong>
          </div>
          <div className="bar-controls">
            {profile && (
              <a href="/console/billing" className="console-credit">
                <Wallet size={16} aria-hidden="true" />
                <span>Credits</span>
                <strong>{creditBalance(profile.balance)}</strong>
              </a>
            )}
            <button
              type="button"
              className="button quiet small command-toggle"
              onClick={() => setPalette(true)}
              aria-label="Jump to ⌘ K"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Search size={16} />
              <span>Jump to</span>
              <kbd aria-hidden="true">⌘ K</kbd>
            </button>
            <span className="console-theme">
              <ThemeSwitch choose={(next) => void chooseTheme(next)} />
            </span>
            <WalletControl wallet={signedIn || undefined} cluster={cluster} checkingAccount={checkingAccount} onSignIn={signIn} onSignOut={signOut} />
            <button
              type="button"
              className="mobile-menu-control console-menu-toggle"
              aria-expanded={navOpen}
              aria-controls="console-navigation"
              aria-label={navOpen ? "Close workspace menu" : "Open workspace menu"}
              onClick={(event) => toggleNavigation(event.currentTarget)}
            >
              <span className="mobile-menu-glyph" aria-hidden="true">
                <span />
              </span>
            </button>
          </div>
        </header>
        <CommandMenu
          open={palette}
          onClose={() => setPalette(false)}
          pages={visibleItems}
          onToggleTheme={() => {
            const cycle: Theme[] = ["light", "dark", "system"];
            void chooseTheme(cycle[(cycle.indexOf(theme) + 1) % cycle.length]);
          }}
          inviteUrl={inviteUrl}
        />
        <main id="console-content" tabIndex={-1} className={selected.id === "chat" ? "console-chat" : "console-content"}>
          <ConsoleShellContext.Provider value={shell}>
            <SessionContext.Provider value={session}>
              {session.error && (
                <p role="alert" className="error">
                  {session.error}
                </p>
              )}
              {serviceEnabled && !profile && selected.id === "chat" && (
                <div className="workspace-setup-invite">
                  <Sparkles size={16} aria-hidden />
                  <span>New to Sonnely?</span>
                  <button type="button" className="text-link" onClick={() => setSetupOpen(true)}>
                    Set up your workspace <ArrowUpRight size={14} aria-hidden />
                  </button>
                </div>
              )}
              {termsRequired && !showSetup && <TermsAcceptance accept={acceptTerms} />}
              {showSetup && (
                <Onboarding
                  wallet={signedIn || undefined}
                  settings={settings.state}
                  cluster={cluster}
                  canFund
                  termsRequired={termsRequired}
                  onSignIn={signIn}
                  onSignOut={signOut}
                  onSaveProfile={saveProfile}
                  onAcceptTerms={acceptTerms}
                  onFinish={finishOnboarding}
                  onChooseTheme={chooseTheme}
                  close={() => {
                    setSetupOpen(false);
                    setDismissedWallet(signedIn || undefined);
                  }}
                />
              )}
              {children}
            </SessionContext.Provider>
          </ConsoleShellContext.Provider>
        </main>
      </div>
      <nav className="mobile-dock glass" aria-label="Quick workspace navigation">
        {all
          .filter(({ id }) => ["chat", "models", "usage"].includes(id))
          .map(({ id, path, Icon, title }) => (
            <a key={id} href={path} className="dock-item" aria-current={id === selected.id ? "page" : undefined} onClick={() => setNavOpen(false)}>
              <Icon size={20} aria-hidden />
              <span>{title}</span>
            </a>
          ))}
        <button className="dock-item" type="button" aria-expanded={navOpen} aria-controls="console-navigation" onClick={(event) => toggleNavigation(event.currentTarget)}>
          <Menu size={20} aria-hidden />
          <span>All pages</span>
        </button>
      </nav>
      <AmbientVisualizer motion={motion} theme={theme} />
      </div>
    </div>
  );
}

/** The session remote, for sections that gate or personalize on it. */
export const SessionContext = createContext<WorkspaceSessionRemote | null>(null);

/** The session remote of the frame a section renders inside. */
export function useWorkspaceSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("console sections render inside ConsoleFrame");
  return session;
}
