// spec/app/console/index.md: the frame every console section shares — the section rail, the session-aware
// header and the sign-in state the sections gate themselves on.
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Box,
  Container,
  Cpu,
  Files,
  KeyRound,
  LifeBuoy,
  List,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { Section } from "../../../../gen/app__nav.ts";
import type { Session as WorkspaceSession } from "../../../../gen/app__session.ts";
import { Button, Input, cn } from "@repo/ui";
import { useRemote, type Remote } from "../../remote.ts";
import { shorten } from "./bits.tsx";

export type { WorkspaceSession };

/** The sections the rail links to, in the legacy console's groups. */
const groups = [
  {
    label: "Inference",
    items: [
      { section: "Chat" as Section, title: "Playground", path: "/console/chat", Icon: MessageSquare },
      { section: "Catalog" as Section, title: "Models", path: "/console/models", Icon: Cpu },
      { section: "Keys" as Section, title: "API keys", path: "/console/keys", Icon: KeyRound },
      { section: "Usage" as Section, title: "Usage", path: "/console/usage", Icon: Activity },
      { section: "Logs" as Section, title: "Request logs", path: "/console/logs", Icon: List },
      { section: "Batch" as Section, title: "Batch", path: "/console/batch", Icon: Files },
    ],
  },
  {
    label: "Compute",
    items: [
      { section: "Consoles" as Section, title: "Blackboxes", path: "/console/blackboxes", Icon: Box },
      { section: "Docks" as Section, title: "Dry Docks", path: "/console/dry-docks", Icon: Container },
    ],
  },
  {
    label: "Workspace",
    items: [
      { section: "Billing" as Section, title: "Billing", path: "/console/billing", Icon: Wallet },
      { section: "Teams" as Section, title: "Teams", path: "/console/teams", Icon: Users },
      { section: "Referrals" as Section, title: "Referrals", path: "/console/referrals", Icon: Users },
      { section: "Support" as Section, title: "Support", path: "/console/support", Icon: LifeBuoy },
      { section: "Admin" as Section, title: "Admin", path: "/console/admin", Icon: ShieldCheck },
      { section: "Settings" as Section, title: "Settings", path: "/console/settings", Icon: Settings },
    ],
  },
];

const all = groups.flatMap((group) => group.items);

/** Sign in or out with a Solana wallet: the header's session control. */
function WalletControl({ session, send }: { session: WorkspaceSession | undefined; send: (input: unknown) => Promise<boolean> }) {
  const [wallet, setWallet] = useState("");
  const [open, setOpen] = useState(false);
  if (session?.tag === "SignedIn") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs" title={session.wallet}>
          {shorten(session.wallet)}
        </span>
        <Button variant="outline" size="sm" onClick={() => void send({ type: "signOut" })}>
          Sign out
        </Button>
      </div>
    );
  }
  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Wallet size={15} aria-hidden /> Connect wallet
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (wallet.trim()) void send({ type: "signIn", wallet: wallet.trim() });
      }}
    >
      <Input
        aria-label="Solana wallet address"
        placeholder="Solana wallet address"
        className="h-8 w-56 font-mono text-xs"
        value={wallet}
        onChange={(event) => setWallet(event.target.value)}
        autoFocus
      />
      <Button variant="primary" size="sm" type="submit" disabled={!wallet.trim()}>
        Sign in
      </Button>
    </form>
  );
}

/** The console frame: section rail on the left, session-aware header, and the section's own content. */
export function ConsoleFrame({ section, children }: { section: Section; children: ReactNode }) {
  const session = useRemote<WorkspaceSession>("session");
  const selected = all.find((item) => item.section === section) ?? all[0];
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex flex-col gap-1 border-b border-border p-4">
          <a href="/" className="font-serif text-xl">
            Sonnely
          </a>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Developer console</p>
        </div>
        <a href="/console/settings" className="flex items-center gap-3 border-b border-border p-4 hover:bg-accent">
          <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            <Wallet size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm">
              {session.state?.tag === "SignedIn" ? shorten(session.state.wallet) : "Your workspace"}
            </strong>
            <small className="text-xs text-muted-foreground">
              {session.state?.tag === "SignedIn" ? "Solana wallet connected" : "Solana wallet access"}
            </small>
          </span>
        </a>
        <nav aria-label="Workspace navigation" className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              {group.items.map(({ section: item, title, path, Icon }) => (
                <a
                  key={item}
                  href={path}
                  aria-current={item === section ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                    item === section && "bg-accent font-medium text-foreground",
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{title}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <a
            href="/docs"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <BookOpen size={16} aria-hidden /> Documentation <ArrowUpRight size={13} aria-hidden />
          </a>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4 md:px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
            <a href="/console/chat" className="hover:text-foreground">
              Console
            </a>
            <span aria-hidden>/</span>
            <span className="flex items-center gap-1.5 text-foreground">
              <selected.Icon size={15} aria-hidden />
              {selected.title}
            </span>
          </nav>
          <WalletControl session={session.state} send={session.send} />
        </header>
        <nav
          aria-label="Workspace navigation"
          className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden"
        >
          {all.map(({ section: item, title, path }) => (
            <a
              key={item}
              href={path}
              aria-current={item === section ? "page" : undefined}
              className={cn(
                "rounded-md px-2 py-1 text-sm whitespace-nowrap text-muted-foreground",
                item === section && "bg-accent text-foreground",
              )}
            >
              {title}
            </a>
          ))}
        </nav>
        <main id="console-content" className="flex-1 p-4 md:p-6">
          <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
        </main>
      </div>
    </div>
  );
}

/** The session remote, for sections that gate or personalize on it. */
export const SessionContext = createContext<Remote<WorkspaceSession> | null>(null);

/** The session remote of the frame a section renders inside. */
export function useWorkspaceSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("console sections render inside ConsoleFrame");
  return session;
}
