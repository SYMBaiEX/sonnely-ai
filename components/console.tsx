"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Box,
  Container,
  CircleHelp,
  Command,
  Cpu,
  KeyRound,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { nearCatalog } from "@/lib/near-catalog";
import type { Section } from "@/app/console/[[...section]]/page";
import { creditBalance } from "@/lib/credit-amount";
import { shorten } from "@/lib/models";
import { Brand } from "./brand";
import { Compute } from "./compute";
import { CommandMenu } from "./command-menu";
import { setTheme, ThemeSurface, ThemeSwitch, useTheme } from "./appearance";
import { Admin } from "./admin";
import { Chat } from "./chat";
import { NearModelDirectory } from "./near-model-directory";
import { ModelCatalog } from "./shared";
import type { ProviderId } from "@/lib/provider-catalog";
import { Billing, Keys, Referrals, SettingsPanel, Usage, type Preferences } from "./workspace";
import { TermsAcceptance } from "./terms-acceptance";
import { useSession, WalletControl } from "./wallet";
import { WorkspaceHeading } from "./workspace-heading";

const nav = [
  { id: "chat", title: "Playground", path: "/console", Icon: MessageSquare },
  { id: "models", title: "Models", path: "/console/models", Icon: Cpu },
  { id: "keys", title: "API keys", path: "/console/keys", Icon: KeyRound },
  { id: "usage", title: "Usage", path: "/console/usage", Icon: Activity },
  { id: "blackboxes", title: "Blackboxes", path: "/console/blackboxes", Icon: Box },
  { id: "dry-docks", title: "Dry Docks", path: "/console/dry-docks", Icon: Container },
  { id: "billing", title: "Billing", path: "/console/billing", Icon: Wallet },
  { id: "referrals", title: "Referrals", path: "/console/referrals", Icon: Users },
  { id: "admin", title: "Admin", path: "/console/admin", Icon: ShieldCheck },
  { id: "settings", title: "Settings", path: "/console/settings", Icon: Settings },
] as const;
const defaults: Preferences = { theme: "dark", localHistory: false, plain: true };

export function Console({
  section,
  initialModel,
  initialProvider,
  initialRun,
  availableProviders,
  providerCatalog,
}: {
  section: Section;
  initialModel: string;
  initialProvider: ProviderId;
  initialRun?: string;
  availableProviders: ProviderId[];
  providerCatalog?: Awaited<ReturnType<typeof nearCatalog>>;
}) {
  const [range, setRange] = useState(30);
  const { session, failure, refresh, liveRows } = useSession(section === "usage" ? range : 0);
  const [navOpen, setNavOpen] = useState(false);
  const navToggle = useRef<HTMLButtonElement>(null);
  const navPanel = useRef<HTMLElement>(null);
  const [palette, setPalette] = useState(false);
  const [prefs, setPrefs] = useState(defaults);
  const theme = useTheme();

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
  useEffect(() => {
    if (!navOpen) return;
    navPanel.current?.querySelector<HTMLAnchorElement>("[aria-current='page']")?.focus();
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
  const signedIn = Boolean(profile);
  const visibleNav = nav.filter((item) => item.id !== "admin" || profile?.role === "admin");
  const selected = nav.find((item) => item.id === section)!;
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
      <div className="console-world" aria-hidden="true" />
      <a href="#console-content" className="skip">
        Skip to workspace
      </a>
      <aside ref={navPanel} id="console-navigation" className={"rail glass" + (navOpen ? " rail-open" : "")}>
        <div className="rail-top">
          <Brand />
          <p className="mono rail-caption">Developer console</p>
        </div>
        <Link
          className="rail-identity"
          href="/console/settings"
          aria-label="Manage workspace identity"
          onClick={() => setNavOpen(false)}
        >
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
          {sidebar(visibleNav.slice(0, 4))}
          <p className="mono">Compute</p>
          {sidebar(visibleNav.slice(4, 6))}
          <p className="mono">Workspace</p>
          {sidebar(visibleNav.slice(6))}
        </nav>
        <div className="rail-bottom">
          <span className="rail-theme">
            <ThemeSwitch />
          </span>
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
              aria-label="Quick navigation"
            >
              <Search size={16} />
              <span>Jump to</span>
              <kbd>
                <Command size={12} /> K
              </kbd>
            </button>
            <span className="console-theme">
              <ThemeSwitch />
            </span>
            <WalletControl session={session} refresh={refresh} />
          </div>
        </header>
        <CommandMenu open={palette} onClose={() => setPalette(false)} pages={visibleNav} />
        <main id="console-content" className={section === "chat" ? "console-chat" : "console-content"}>
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          {session?.termsRequired && <TermsAcceptance refresh={refresh} />}
          {section === "chat" && (
            <Chat
              key={(profile?.wallet ?? "guest") + ":" + initialModel + ":" + initialProvider}
              session={session}
              initialModel={initialModel}
              initialProvider={initialProvider}
              availableProviders={availableProviders}
              refresh={refresh}
              localHistory={prefs.localHistory}
              plain={prefs.plain}
            />
          )}
          {section === "models" && (
            <>
              <WorkspaceHeading
                icon={Cpu}
                title="Models"
                description="Compare models, inference providers, and token rates."
              >
                <Link href="#near-directory" className="text-link">
                  Browse the full NEAR directory <ArrowUpRight size={15} />
                </Link>
              </WorkspaceHeading>
              <ModelCatalog availableProviders={availableProviders} />
              {providerCatalog && <NearModelDirectory {...providerCatalog} />}
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
          {section === "admin" && <Admin session={session} />}
          {section === "keys" && <Keys signedIn={signedIn} />}
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
                <Link href="/console/blackboxes">
                  Blackbox rentals <ArrowUpRight size={15} />
                </Link>
                <Link href="/console/dry-docks">
                  Dry Dock builds <ArrowUpRight size={15} />
                </Link>
              </section>
            </>
          )}
          {section === "billing" && (
            <Billing key={session?.profile?.wallet ?? "guest"} session={session} refresh={refresh} />
          )}
          {section === "referrals" && <Referrals key={profile?.wallet ?? "guest"} profile={profile} />}
          {section === "settings" && (
            <SettingsPanel
              profile={profile}
              refresh={refresh}
              preferences={{ ...prefs, theme }}
              change={change}
            />
          )}
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
          ref={navToggle}
          className="dock-item"
          type="button"
          aria-expanded={navOpen}
          aria-controls="console-navigation"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen(!navOpen)}
        >
          <Menu size={20} aria-hidden />
          <span>All pages</span>
        </button>
      </nav>
    </ThemeSurface>
  );
}
