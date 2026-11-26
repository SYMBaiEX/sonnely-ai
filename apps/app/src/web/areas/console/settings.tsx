// spec/app/console/index.md, "Story: Set up the workspace profile" and "Story: Choose how this device shows the
// console"; spec/app/session.md, "Story: Sign in with a wallet": workspace identity, preferences and sessions.
import { useState, type FormEvent } from "react";
import { CircleHelp, Code2, FileText, MonitorSmartphone, Settings, Shield } from "lucide-react";
import type { Console, Theme as ConsoleTheme } from "../../../../gen/app__console.ts";
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

function PreferencesPanel({ settings, state }: { settings: Remote<Console>; state?: Console }) {
  const shell = useConsoleShell();
  return (
    <section className="panel stack-panel settings-panel">
      <div className="between">
        <h2>Preferences</h2>
        <Code2 size={20} />
      </div>
      <div className="settings-row">
        <div>
          <strong>Appearance</strong>
          <p>Choose the console theme.</p>
        </div>
        <div className="segmented">
          {themes.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={shell.theme === browserThemes[id]}
              onClick={() => void shell.chooseTheme(browserThemes[id])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div>
          <strong>Ambient motion</strong>
          <p>Animate the background and the homepage request trace.</p>
        </div>
        <MotionSwitch />
      </div>
      <div className="settings-row">
        <div>
          <strong>Plain writing</strong>
          <p>Ask the chat model for concise, clear language.</p>
        </div>
        <button
          type="button"
          role="switch"
          className="toggle"
          aria-label="Plain writing"
          aria-checked={state?.plain ?? true}
          onClick={() => void settings.send({ type: "setPlain", on: !(state?.plain ?? true) })}
        >
          <span />
        </button>
      </div>
      <div className="settings-row">
        <div>
          <strong>Save on this device</strong>
          <p>Turning this off clears saved Sonnely chats from this browser.</p>
        </div>
        <button
          type="button"
          role="switch"
          className="toggle"
          aria-label="Save on this device"
          aria-checked={state?.saveOnDevice ?? false}
          onClick={() => void settings.send({ type: "setSaveOnDevice", on: !(state?.saveOnDevice ?? false) })}
        >
          <span />
        </button>
      </div>
    </section>
  );
}

function SessionsPanel({ session }: { session: WorkspaceSessionRemote }) {
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const sessions = session.state?.tag === "SignedIn" ? (session.state.sessions ?? []).filter((item) => item.state === "LoginActive") : [];

  return (
    <section className="panel stack-panel settings-panel">
      <div className="between">
        <h2>Active sessions</h2>
        <MonitorSmartphone size={20} />
      </div>
      {wallet && sessions.length ? (
        sessions.map((item) => (
          <div className="settings-row" key={item.digest}>
            <div>
              <strong>{item.current ? "This session" : "Signed in " + date(item.createdAt)}</strong>
              <p>Expires {date(item.expiresAt)} UTC</p>
            </div>
            {item.current && <span className="pill">Current</span>}
          </div>
        ))
      ) : (
        <p className="caption" role="status">
          {!wallet ? "Connect a wallet to see active sessions." : "No active sessions."}
        </p>
      )}
      <p className="caption">Sign out this device from the wallet control in the console header.</p>
    </section>
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
      const ok = await shell.saveProfile(String(fields.get("name") ?? ""), String(fields.get("username") ?? ""));
      if (ok) setNotice("Profile saved.");
      else setError("The profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <WorkspaceHeading
        icon={Settings}
        title="Settings"
        description="Edit your profile and choose how this device displays the console."
      />
      <Failure message={error || settings.error || session.error || ""} />
      <p role="status" className={notice ? "status" : "visually-hidden"}>
        {notice}
      </p>
      <section className="panel stack-panel settings-panel">
        <div className="between">
          <h2>Workspace identity</h2>
          <Shield size={20} />
        </div>
        <div className="settings-row">
          <div>
            <strong>Solana wallet</strong>
            <p>{wallet ? shorten(wallet) : "Connect a wallet to manage your account."}</p>
          </div>
          {wallet && <CopyButton value={wallet} label="Copy address" />}
        </div>
        {wallet && (
          <form className="settings-profile-form" onSubmit={(event) => void rename(event)} key={wallet + (state?.name ?? "") + (state?.username ?? "")}>
            <label>
              Display name
              <input name="name" maxLength={60} defaultValue={state?.name ?? ""} placeholder="Your name" />
            </label>
            <label>
              Username
              <input
                name="username"
                aria-describedby="username-help"
                maxLength={24}
                defaultValue={state?.username ?? ""}
                placeholder="your_username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span id="username-help" className="caption">
                {usernameHelp} Shown in referral activity.
              </span>
            </label>
            <button className="button quiet" type="submit" disabled={busy}>
              Save profile
            </button>
          </form>
        )}
      </section>
      <PreferencesPanel settings={settings} state={state} />
      <SessionsPanel session={session} />
      <div className="actions">
        <a className="button quiet" href="/docs/attestation#data-handling">
          <FileText size={17} /> Data handling
        </a>
        <a className="button quiet" href="/contact">
          <CircleHelp size={17} /> Account support
        </a>
      </div>
    </>
  );
}

export function SettingsSection() {
  return (
    <div className="workspace-surface">
      <SettingsContent />
    </div>
  );
}
