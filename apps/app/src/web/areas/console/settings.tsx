// spec/app/console/index.md, "Story: Set up the workspace profile"; spec/app/console/index.md, "Story: Choose how this device shows the console"; spec/app/console/index.md, "Story: Choose whether the workspace keeps chat history"; spec/app/console/chat.md, "Story: Erase what the workspace keeps"; spec/app/session.md, "Story: Sign in with a wallet"
import { useState, type FormEvent, type ReactNode } from "react";
import { CircleHelp, Code2, FileText, MonitorSmartphone, Settings, Shield, Trash2 } from "lucide-react";
import { Button, Card, CardTitle, Checkbox, Input, Label, SegmentedControl, SegmentedControlItem } from "@repo/ui";
import type { Console, Theme as ConsoleTheme } from "../../../../gen/app__console.ts";
import type { Chat } from "../../../../gen/app__console__chat.ts";
import { useRemote, type Remote } from "../../remote.ts";
import type { Theme as BrowserTheme } from "../site/chrome.tsx";
import { MotionSwitch } from "../site/motion.tsx";
import { useConsoleShell, type WorkspaceSessionRemote } from "./frame.tsx";
import { CopyButton, Failure, WorkspaceHeading, date, shorten } from "./bits.tsx";

const usernameHelp = "Use 3–24 letters, numbers, or underscores. Start with a letter.";
const themes: { id: ConsoleTheme; label: string }[] = [
  { id: "System", label: "system" },
  { id: "Light", label: "light" },
  { id: "Dark", label: "dark" },
];
const browserThemes: Record<ConsoleTheme, BrowserTheme> = { System: "system", Light: "light", Dark: "dark" };
const rowClass = "flex flex-wrap items-center justify-between gap-4 border-t border-border py-3 first:border-t-0";
const rowTextClass = "max-w-2xl";
const rowTitleClass = "text-ui font-medium text-foreground";
const metaClass = "mt-1 text-meta text-muted-foreground";
const panelIconClass = "text-primary";
const fieldClass = "grid gap-2 text-ui font-medium text-foreground";
const noticeClass = "rounded-md border px-3 py-2 text-ui";
const currentPillClass = "inline-flex items-center rounded-xl border border-info/40 bg-info/10 px-2 py-0.5 text-micro font-medium text-info";

function formText(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-3 p-4 shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <CardTitle className="text-lead tracking-heading">{title}</CardTitle>
        <span className={panelIconClass}>{icon}</span>
      </div>
      {children}
    </Card>
  );
}

function PreferenceRow({ title, children, control }: { title: string; children: ReactNode; control: ReactNode }) {
  return (
    <div className={rowClass}>
      <div className={rowTextClass}>
        <strong className={rowTitleClass}>{title}</strong>
        <p className={metaClass}>{children}</p>
      </div>
      {control}
    </div>
  );
}

function PreferencesPanel({ settings, state }: { settings: Remote<Console>; state?: Console }) {
  const shell = useConsoleShell();
  const send = (input: unknown) => settings.send(input);
  return (
    <Panel title="Preferences" icon={<Code2 size={20} aria-hidden />}>
      <PreferenceRow
        title="Appearance"
        control={
          <SegmentedControl aria-label="Console theme" value={shell.theme} onValueChange={(theme: string) => void shell.chooseTheme(theme as BrowserTheme)}>
            {themes.map(({ id, label }) => (
              <SegmentedControlItem key={id} value={browserThemes[id]}>{label}</SegmentedControlItem>
            ))}
          </SegmentedControl>
        }
      >
        Choose the console theme.
      </PreferenceRow>
      <PreferenceRow title="Ambient motion" control={<MotionSwitch />}>
        Animate the background and the homepage request trace.
      </PreferenceRow>
      <PreferenceRow
        title="Plain writing"
        control={
          <Label className="flex items-center gap-2 text-meta font-regular text-muted-foreground">
            <Checkbox
              aria-label="Plain writing"
              checked={state?.plain ?? true}
              onCheckedChange={(checked) => void send({ type: "setPlain", on: checked === true })}
            />
            Enabled
          </Label>
        }
      >
        Ask the chat model for concise, clear language.
      </PreferenceRow>
      <PreferenceRow
        title="Chat history"
        control={
          <Label className="flex items-center gap-2 text-meta font-regular text-muted-foreground">
            <Checkbox
              aria-label="Chat history"
              checked={state?.history ?? true}
              onCheckedChange={(checked) => void send({ type: "setHistory", on: checked === true })}
            />
            Enabled
          </Label>
        }
      >
        Keep playground conversations server-side under your wallet, so they reopen on any device. Off, new conversations live in the browser session only and are never written to the server. Already-kept conversations stay until you clear them below.
      </PreferenceRow>
    </Panel>
  );
}

function ClearHistoryPanel() {
  const chat = useRemote<Chat>("console__chat");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const threads = chat.state?.threads.length ?? 0;

  async function clear() {
    setBusy(true);
    setMessage("");
    try {
      const cleared = await chat.send({ type: "clearAll" });
      setMessage(cleared ? "Chat history cleared from the server." : "The workspace refused to clear the history.");
      if (cleared) setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Chat history" icon={<Trash2 size={20} aria-hidden />}>
      <PreferenceRow
        title="Clear chat history"
        control={
          !confirming ? (
            <Button variant="outline" disabled={busy || !threads} onClick={() => setConfirming(true)}>
              Clear history
            </Button>
          ) : undefined
        }
      >
        Erase every playground conversation the server keeps for this wallet{threads ? ` — currently ${threads}` : ""}. Export any transcript you want to keep first; clearing cannot be undone.
      </PreferenceRow>
      {confirming && (
        <div className={rowClass}>
          <div className={rowTextClass}>
            <strong className={rowTitleClass}>Erase {threads === 1 ? "this conversation" : `all ${threads} conversations`}?</strong>
            <p className={metaClass}>The server forgets every prompt and answer it keeps for this wallet.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Keep history
            </Button>
            <Button loading={busy} onClick={() => void clear()}>
              Clear everything
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p className={`${noticeClass} border-info/40 bg-info/10 text-info`} role="status">
          {message}
        </p>
      )}
    </Panel>
  );
}

function SessionsPanel({ session }: { session: WorkspaceSessionRemote }) {
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const sessions = session.state?.tag === "SignedIn" ? (session.state.sessions ?? []).filter((item) => item.state === "LoginActive") : [];

  return (
    <Panel title="Active sessions" icon={<MonitorSmartphone size={20} aria-hidden />}>
      {wallet && sessions.length ? (
        sessions.map((item) => (
          <div className={rowClass} key={item.digest}>
            <div className={rowTextClass}>
              <strong className={rowTitleClass}>{item.current ? "This session" : "Signed in " + date(item.createdAt)}</strong>
              <p className={metaClass}>Expires {date(item.expiresAt)} UTC</p>
            </div>
            {item.current && <span className={currentPillClass}>Current</span>}
          </div>
        ))
      ) : (
        <p className={metaClass} role="status">
          {!wallet ? "Connect a wallet to see active sessions." : "No active sessions."}
        </p>
      )}
      <p className={metaClass}>Sign out this device from the wallet control in the console header.</p>
    </Panel>
  );
}

function SettingsContent() {
  const shell = useConsoleShell();
  const session = shell.session;
  const settings = useRemote<Console>("console");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const state = settings.state;
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ok = await shell.saveProfile(formText(fields, "name"), formText(fields, "username"));
      if (ok) setNotice("Profile saved.");
      else setError("The profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <WorkspaceHeading icon={Settings} title="Settings" description="Manage your profile and console preferences." />
      <Failure message={error || settings.error || session.error || ""} />
      <p role="status" className={notice ? `${noticeClass} border-ok/40 bg-ok/10 text-ok` : "sr-only"}>
        {notice}
      </p>
      <Panel title="Workspace identity" icon={<Shield size={20} aria-hidden />}>
        <PreferenceRow title="Solana wallet" control={wallet ? <CopyButton value={wallet} label="Copy address" /> : undefined}>
          {wallet ? shorten(wallet) : "Connect a wallet to manage your account."}
        </PreferenceRow>
        {wallet && (
          <form
            className="grid items-start gap-4 border-t border-border py-4 sm:grid-cols-2"
            onSubmit={(event) => void rename(event)}
            key={wallet + (state?.name ?? "") + (state?.username ?? "")}
          >
            <Label className={fieldClass}>
              Display name
              <Input name="name" maxLength={60} defaultValue={state?.name ?? ""} placeholder="Your name" />
            </Label>
            <Label className={fieldClass}>
              Username
              <Input
                name="username"
                aria-describedby="username-help"
                maxLength={24}
                pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                title={usernameHelp}
                defaultValue={state?.username ?? ""}
                placeholder="your_username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span id="username-help" className={metaClass}>
                {usernameHelp} Shown in referral activity.
              </span>
            </Label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="outline" loading={busy}>
                Save profile
              </Button>
            </div>
          </form>
        )}
      </Panel>
      <PreferencesPanel settings={settings} state={state} />
      {wallet && <ClearHistoryPanel />}
      <SessionsPanel session={session} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href="/docs/attestation#data-handling">
            <FileText size={17} aria-hidden /> Data handling
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/contact">
            <CircleHelp size={17} aria-hidden /> Account support
          </a>
        </Button>
      </div>
    </>
  );
}

export function SettingsSection() {
  return (
    <div className="grid min-w-0 gap-3 text-foreground">
      <SettingsContent />
    </div>
  );
}
