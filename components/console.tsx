"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Box,
  Container,
  CircleHelp,
  Cpu,
  KeyRound,
  LifeBuoy,
  List,
  Menu,
  MessageSquare,
  Search,
  Sparkles,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { computeProducts, isComputeProduct, type ComputeFeatures } from "@/lib/compute-features";
import { computePlans } from "@/lib/compute";
import type { Theme } from "@/lib/appearance";

import type { Section } from "@/app/console/[[...section]]/page";
import { creditBalance } from "@/lib/credit-amount";
import { shorten } from "@/lib/models";
import { Brand } from "./brand";
import { Compute } from "./compute";
import { CommandMenu } from "./command-menu";
import { setTheme, ThemeSurface, ThemeSwitch, useTheme } from "./appearance";
import { Admin } from "./admin";
import { Chat } from "./chat";
import { Playground } from "./playground";

import { ModelCatalog } from "./model-catalog";
import type { ProviderId } from "@/lib/provider-catalog";
import { Billing, Keys, Referrals, SettingsPanel, Usage, type Preferences } from "./workspace";
import { Onboarding } from "./onboarding";
import { RequestLogs } from "./request-logs";
import { SupportPanel } from "./support";
import { TermsAcceptance } from "./terms-acceptance";
import { useSession, WalletControl } from "./wallet";
import { WorkspaceHeading } from "./workspace-heading";

const nav = [
  { id: "chat", title: "Playground", path: "/console", Icon: MessageSquare },
  { id: "models", title: "Models", path: "/console/models", Icon: Cpu },
  { id: "keys", title: "API keys", path: "/console/keys", Icon: KeyRound },
  { id: "usage", title: "Usage", path: "/console/usage", Icon: Activity },
  { id: "logs", title: "Request logs", path: "/console/logs", Icon: List },
  { id: "blackboxes", title: "Blackboxes", path: "/console/blackboxes", Icon: Box },
  { id: "dry-docks", title: "Dry Docks", path: "/console/dry-docks", Icon: Container },
  { id: "billing", title: "Billing", path: "/console/billing", Icon: Wallet },
  { id: "referrals", title: "Referrals", path: "/console/referrals", Icon: Users },
  { id: "support", title: "Support", path: "/console/support", Icon: LifeBuoy },
  { id: "admin", title: "Admin", path: "/console/admin", Icon: ShieldCheck },
  { id: "settings", title: "Settings", path: "/console/settings", Icon: Settings },
] as const;
const defaults: Preferences = { theme: "dark", localHistory: false, plain: true };

const ConsoleContext = createContext<
  | (ReturnType<typeof useSession> & {
      range: number;
      setRange: (days: number) => void;
      preferences: Preferences;
      change: (preferences: Preferences) => void;
    })
  | null
>(null);

export function ConsoleShell({ children, features }: { children: ReactNode; features: ComputeFeatures }) {
  const pathname = usePathname();
  const selected = nav.find((item) => item.path === pathname) ?? nav[0];
  const section = selected.id;
  const [range, setRange] = useState(30);
  const account = useSession(section === "usage" ? range : 0);
  const { session, failure, refresh } = account;
  const checkingAccount = !session && !failure;
  const [navOpen, setNavOpen] = useState(false);
  const navToggle = useRef<HTMLButtonElement>(null);
  const navPanel = useRef<HTMLElement>(null);
  const [palette, setPalette] = useState(false);
  const [prefs, setPrefs] = useState(defaults);
  const [origin, setOrigin] = useState("");
  const theme = useTheme();

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    try {
      setPrefs({
        ...defaults,
        ...JSON.parse(
          localStorage.getItem("sonnely.preferences") ?? localStorage.getItem("fathom.preferences") ?? "{}",
        ),
      });
    } catch {
      /* Use defaults when stored preferences cannot be restored. */
    }
  }, []);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((isOpen) => !isOpen);
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  function closeNavigation() {
    setNavOpen(false);
    navToggle.current?.focus();
  }
  function toggleNavigation(trigger: HTMLButtonElement) {
    navToggle.current = trigger;
    if (navOpen) closeNavigation();
    else setNavOpen(true);
  }
  useEffect(() => {
    if (!navOpen) return;
    const panel = navPanel.current;
    (
      panel?.querySelector<HTMLAnchorElement>("[aria-current='page']") ??
      panel?.querySelector<HTMLAnchorElement>("nav a")
    )?.focus();
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") closeNavigation();
    }
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [navOpen]);

  function change(next: Preferences) {
    setPrefs(next);
    setTheme(next.theme);
    localStorage.setItem("sonnely.preferences", JSON.stringify(next));
    if (!next.localHistory) {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("sonnely.chats.") || key.startsWith("fathom.chats.")) localStorage.removeItem(key);
    }
  }

  const profile = session?.profile;
  const [setupOpen, setSetupOpen] = useState(false);
  const [dismissedWallet, setDismissedWallet] = useState<string>();
  const showSetup =
    session && (setupOpen || (profile?.onboarding === "pending" && profile.wallet !== dismissedWallet));
  const visibleNav = nav.filter(({ id }) =>
    isComputeProduct(id)
      ? features[id]
      : id !== "admin" || Boolean(profile?.role && profile.role !== "member"),
  );
  const computeNav = visibleNav.filter(({ id }) => isComputeProduct(id));
  const PageIcon = selected.Icon;
  const sidebar = (items: (typeof nav)[number][]) =>
    items.map(({ id, title, path, Icon }) => (
      <Link
        key={id}
        href={path}
        onClick={() => setNavOpen(false)}
        aria-current={id === section ? "page" : undefined}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{title}</span>
      </Link>
    ));

  return (
    <ThemeSurface className="console">
      <a href="#console-content" className="skip">
        Skip to workspace
      </a>
      <aside ref={navPanel} id="console-navigation" className={"rail glass" + (navOpen ? " rail-open" : "")}>
        <div className="rail-top">
          <Brand />
          <p className="mono rail-caption">Developer console</p>
        </div>
        <Link className="rail-identity" href="/console/settings" onClick={() => setNavOpen(false)}>
          <span className="rail-identity-icon">
            <Wallet size={17} aria-hidden="true" />
          </span>
          <span>
            <strong>{profile ? profile.name || shorten(profile.wallet) : "Your workspace"}</strong>
            <small>
              {profile?.role === "admin"
                ? "Administrator"
                : profile
                  ? "Solana wallet connected"
                  : "Solana wallet access"}
            </small>
          </span>
        </Link>
        <nav aria-label="Workspace navigation" className="rail-nav">
          <p className="mono">Inference</p>
          {sidebar(visibleNav.slice(0, 5))}
          {computeNav.length > 0 && (
            <>
              <p className="mono">Compute</p>
              {sidebar(computeNav)}
            </>
          )}
          <p className="mono">Workspace</p>
          {sidebar(visibleNav.slice(5).filter(({ id }) => !isComputeProduct(id)))}
        </nav>
        <div className="rail-bottom">
          <span className="rail-theme">
            <ThemeSwitch />
          </span>
          {session?.enabled && (
            <button type="button" className="button quiet small" onClick={() => setSetupOpen(true)}>
              <Sparkles size={16} aria-hidden /> Workspace setup
            </button>
          )}
          <Link href="/docs">
            <BookOpen size={17} /> Documentation <ArrowUpRight size={13} />
          </Link>
          <Link href="/contact">
            <CircleHelp size={17} /> Support <ArrowUpRight size={13} />
          </Link>
          <Link className="balance" href="/console/billing">
            <span>Credit balance</span>
            <b>{profile ? creditBalance(profile.balance) : "—"}</b>
          </Link>
        </div>
      </aside>
      {navOpen && (
        <button
          type="button"
          className="nav-scrim"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={closeNavigation}
        />
      )}
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
              <Link href="/console/billing" className="console-credit">
                <Wallet size={16} aria-hidden="true" />
                <span>Credits</span>
                <strong>{creditBalance(profile.balance)}</strong>
              </Link>
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
              <ThemeSwitch />
            </span>
            <WalletControl session={session} refresh={refresh} checkingAccount={checkingAccount} />
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
          pages={visibleNav}
          onToggleTheme={() => {
            const cycle: Theme[] = ["light", "dark", "system"];
            change({ ...prefs, theme: cycle[(cycle.indexOf(theme) + 1) % cycle.length] });
          }}
          inviteUrl={profile && origin ? origin + "/console?ref=" + profile.referral : undefined}
        />
        <main
          id="console-content"
          tabIndex={-1}
          className={section === "chat" ? "console-chat" : "console-content"}
        >
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          {session?.termsRequired && !showSetup && <TermsAcceptance refresh={refresh} />}
          {session?.enabled && !profile && section === "chat" && (
            <div className="workspace-setup-invite">
              <Sparkles size={16} aria-hidden />
              <span>New to Sonnely?</span>
              <button type="button" className="text-link" onClick={() => setSetupOpen(true)}>
                Set up your workspace <ArrowUpRight size={14} aria-hidden />
              </button>
            </div>
          )}
          {showSetup && (
            <Onboarding
              session={session}
              refresh={refresh}
              close={() => {
                setSetupOpen(false);
                setDismissedWallet(profile?.wallet);
              }}
            />
          )}
          <ConsoleContext value={{ ...account, range, setRange, preferences: { ...prefs, theme }, change }}>
            {children}
          </ConsoleContext>
        </main>
      </div>
      <nav className="mobile-dock glass" aria-label="Quick workspace navigation">
        {nav
          .filter(({ id }) => ["chat", "models", "usage"].includes(id))
          .map(({ id, path, Icon, title }) => (
            <Link
              key={id}
              href={path}
              className="dock-item"
              aria-current={section === id ? "page" : undefined}
              onClick={() => setNavOpen(false)}
            >
              <Icon size={20} aria-hidden />
              <span>{title}</span>
            </Link>
          ))}
        <button
          className="dock-item"
          type="button"
          aria-expanded={navOpen}
          aria-controls="console-navigation"
          onClick={(event) => toggleNavigation(event.currentTarget)}
        >
          <Menu size={20} aria-hidden />
          <span>All pages</span>
        </button>
      </nav>
    </ThemeSurface>
  );
}

export function ConsoleScreen({
  section,
  features,
  initialModel,
  restoreConversation,
  initialProvider,
  initialRun,
  availableProviders,
  intentsFunding,
  solFunding,
}: {
  section: Section;
  features: ComputeFeatures;
  initialModel: string;
  restoreConversation: boolean;
  initialProvider: ProviderId;
  initialRun?: string;
  availableProviders: ProviderId[];
  intentsFunding?: { widgetUrl?: string };
  solFunding?: boolean;
}) {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error("Console screens require the console layout.");
  const { session, failure, refresh, range, setRange, liveRows, preferences, change } = context;
  const profile = session?.profile;
  const signedIn = Boolean(profile);
  if (!session && !failure && section !== "models") {
    return (
      <p className="caption" role="status">
        Checking workspace session…
      </p>
    );
  }

  return (
    <>
      {section === "chat" && (
        <Playground
          key={profile?.wallet ?? "guest"}
          session={session}
          providers={availableProviders}
          refresh={refresh}
        >
          <Chat
            key={
              (profile?.wallet ?? "guest") +
              ":" +
              initialModel +
              ":" +
              initialProvider +
              ":" +
              restoreConversation
            }
            session={session}
            initialModel={initialModel}
            initialProvider={initialProvider}
            availableProviders={availableProviders}
            refresh={refresh}
            localHistory={preferences.localHistory}
            restoreConversation={restoreConversation}
            enableHistory={() => change({ ...preferences, localHistory: true })}
            plain={preferences.plain}
          />
        </Playground>
      )}
      {section === "models" && (
        <>
          <WorkspaceHeading
            icon={Cpu}
            title="Models"
            description="Browse provider models, supported endpoints, and rates."
          />
          <ModelCatalog availableProviders={availableProviders} />
        </>
      )}
      {(section === "blackboxes" || section === "dry-docks") && (
        <Compute
          key={section + (profile?.wallet ?? "guest")}
          kind={section}
          session={session}
          initialRun={initialRun}
          refreshBalance={refresh}
        />
      )}
      {section === "admin" && <Admin session={session} features={features} />}
      {section === "keys" && <Keys signedIn={signedIn} />}
      {section === "logs" && <RequestLogs key={profile?.wallet ?? "guest"} wallet={profile?.wallet} />}
      {section === "usage" && (
        <>
          <Usage
            key={profile?.wallet ?? "guest"}
            signedIn={signedIn}
            balance={profile?.balance}
            range={range}
            setRange={setRange}
            liveRows={liveRows}
          />
          <section className="panel workspace-compute-links" aria-label="Compute usage">
            <h2>Compute usage</h2>
            {computeProducts.map((id) =>
              features[id] ? (
                <Link key={id} href={"/console/" + id}>
                  {computePlans[id].title} <ArrowUpRight size={15} />
                </Link>
              ) : (
                <p className="caption" key={id}>
                  {computePlans[id].title} · Coming soon
                </p>
              ),
            )}
          </section>
        </>
      )}
      {section === "billing" && (
        <Billing
          key={session?.profile?.wallet ?? "guest"}
          session={session}
          refresh={refresh}
          intentsFunding={intentsFunding}
          solFunding={solFunding}
        />
      )}
      {section === "referrals" && <Referrals key={profile?.wallet ?? "guest"} profile={profile} />}
      {section === "support" && <SupportPanel key={profile?.wallet ?? "guest"} profile={profile} />}
      {section === "settings" && (
        <SettingsPanel profile={profile} refresh={refresh} preferences={preferences} change={change} />
      )}
    </>
  );
}
