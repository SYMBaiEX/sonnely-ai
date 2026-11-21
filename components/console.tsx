"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Command,
  Cpu,
  KeyRound,
  Menu,
  MessageSquare,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import type { Section } from "@/app/console/[[...section]]/page";
import { usd } from "@/lib/models";
import { Brand } from "./brand";
import { Chat } from "./chat";
import { ModelCatalog } from "./shared";
import { Billing, Keys, Referrals, SettingsPanel, Usage, type Preferences } from "./workspace";
import { useSession, WalletControl } from "./wallet";

const nav = [
  { id: "chat", title: "Playground", path: "/console", Icon: MessageSquare },
  { id: "models", title: "Models", path: "/console/models", Icon: Cpu },
  { id: "keys", title: "API keys", path: "/console/keys", Icon: KeyRound },
  { id: "usage", title: "Usage", path: "/console/usage", Icon: Activity },
  { id: "billing", title: "Billing", path: "/console/billing", Icon: Wallet },
  { id: "referrals", title: "Referrals", path: "/console/referrals", Icon: Users },
  { id: "settings", title: "Settings", path: "/console/settings", Icon: Settings },
] as const;
const defaults: Preferences = { theme: "dark", localHistory: false, plain: true };

export function Console({ section, initialModel }: { section: Section; initialModel: string }) {
  const { session, failure, refresh } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [prefs, setPrefs] = useState(defaults);
  const router = useRouter();

  useEffect(() => {
    try {
      setPrefs({ ...defaults, ...JSON.parse(localStorage.getItem("fathom.preferences") || "{}") });
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
  useEffect(() => {
    const dialog = document.querySelector<HTMLDialogElement>("#console-command");
    if (palette && !dialog?.open) dialog?.showModal();
    if (!palette && dialog?.open) dialog.close();
  }, [palette]);

  function change(next: Preferences) {
    setPrefs(next);
    localStorage.setItem("fathom.preferences", JSON.stringify(next));
    if (!next.localHistory) {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("fathom.chats.")) localStorage.removeItem(key);
    }
  }

  const profile = session?.profile;
  const signedIn = Boolean(profile);
  const selected = nav.find((item) => item.id === section)!;
  const sidebar = (items: (typeof nav)[number][]) =>
    items.map(({ id, title, path, Icon }) => (
      <Link
        key={id}
        href={path}
        onClick={() => setNavOpen(false)}
        aria-current={id === section ? "page" : undefined}
      >
        <Icon size={18} />
        <span>{title}</span>
      </Link>
    ));

  return (
    <div className="console" data-theme={prefs.theme}>
      <a href="#console-content" className="skip">
        Skip to workspace
      </a>
      <aside className={"rail" + (navOpen ? " rail-open" : "")}>
        <div className="rail-top">
          <Brand />
          <p className="mono rail-caption">Developer console</p>
        </div>
        <nav aria-label="Workspace navigation" className="rail-nav">
          <p className="mono">Compute</p>
          {sidebar([...nav.slice(0, 4)])}
          <p className="mono">Workspace</p>
          {sidebar([...nav.slice(4)])}
        </nav>
        <div className="rail-bottom">
          <Link href="/docs">
            <BookOpen size={17} /> Documentation <ArrowUpRight size={13} />
          </Link>
          <Link href="/contact">
            <CircleHelp size={17} /> Support <ArrowUpRight size={13} />
          </Link>
          <Link className="balance" href="/console/billing">
            <span>Credit balance</span>
            <b>{profile ? usd(profile.balance) : "—"}</b>
          </Link>
        </div>
      </aside>
      <div className="console-stage">
        <header className="console-bar">
          <div className="crumb">
            <button
              className="icon-button nav-toggle"
              type="button"
              aria-expanded={navOpen}
              aria-label="Toggle navigation"
              onClick={() => setNavOpen(!navOpen)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{selected.title}</strong>
          </div>
          <div className="bar-controls">
            <button
              type="button"
              className="button quiet small command-toggle"
              onClick={() => setPalette(true)}
              aria-label="Quick navigation"
            >
              <Command size={15} /> K
            </button>
            <WalletControl session={session} refresh={refresh} />
          </div>
        </header>
        <dialog id="console-command" className="panel command-dialog" onClose={() => setPalette(false)}>
          <div className="between">
            <h2>Go to page</h2>
            <button type="button" className="button quiet small" onClick={() => setPalette(false)}>
              Close
            </button>
          </div>
          {nav.map(({ title, path, Icon }) => (
            <button
              className="button quiet full"
              key={path}
              type="button"
              onClick={() => {
                setPalette(false);
                router.push(path);
              }}
            >
              <Icon size={17} /> {title}
            </button>
          ))}
        </dialog>
        <main id="console-content" className={section === "chat" ? "console-chat" : "console-content"}>
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          {section === "chat" && (
            <Chat
              key={(profile?.wallet ?? "guest") + ":" + initialModel}
              session={session}
              initialModel={initialModel}
              refresh={refresh}
              localHistory={prefs.localHistory}
              plain={prefs.plain}
            />
          )}
          {section === "models" && (
            <>
              <header className="console-title">
                <h1>Models</h1>
                <p>Compare NEAR AI models by workload and token cost.</p>
              </header>
              <ModelCatalog />
            </>
          )}
          {section === "keys" && <Keys signedIn={signedIn} />}
          {section === "usage" && <Usage signedIn={signedIn} balance={profile?.balance} />}
          {section === "billing" && <Billing session={session} refresh={refresh} />}
          {section === "referrals" && <Referrals profile={profile} />}
          {section === "settings" && (
            <SettingsPanel profile={profile} refresh={refresh} preferences={prefs} change={change} />
          )}
        </main>
      </div>
    </div>
  );
}
