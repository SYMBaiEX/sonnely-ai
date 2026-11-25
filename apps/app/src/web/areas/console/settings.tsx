// spec/app/console/index.md, "Story: Set up the workspace profile" and "Story: Choose how this device shows the
// console"; spec/app/session.md, "Story: Sign in with a wallet": workspace identity, preferences and sessions.
import { useState, type FormEvent } from "react";
import { CircleHelp, Code2, FileText, MonitorSmartphone, Settings, Shield } from "lucide-react";
import type { Console, Theme } from "../../../../gen/app__console.ts";
import type { Session } from "../../../../gen/app__session.ts";
import { useRemote, type Remote } from "../../remote.ts";
import { MotionSwitch } from "../site/motion.tsx";
import { CopyButton, WorkspaceHeading, WorkspaceLegacy, shorten } from "../teams/legacy.tsx";

const usernameHelp = "Use 3–24 letters, numbers, or underscores. Start with a letter.";
const themes: { id: Theme; label: string }[] = [
  { id: "System", label: "system" },
  { id: "Light", label: "light" },
  { id: "Dark", label: "dark" },
];
const date = (time: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(time);

function Failure({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function PreferencesPanel({ settings, state }: { settings: Remote<Console>; state?: Console }) {
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
              aria-pressed={(state?.theme ?? "Dark") === id}
              onClick={() => void settings.send({ type: "chooseTheme", theme: id })}
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

function SessionsPanel({ wallet }: { wallet?: string }) {
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const opened = Date.now();
  const sessions = wallet ? [{ id: "current", created: opened, expires: opened + 7 * 86_400_000, current: true }] : [];

  function signOutOthers() {
    setBusy(true);
    setError("");
    setNotice("");
    setSigningOut(false);
    setNotice("No other sessions to sign out.");
    setBusy(false);
  }

  return (
    <section className="panel stack-panel settings-panel">
      <div className="between">
        <h2>Active sessions</h2>
        <MonitorSmartphone size={20} />
      </div>
      {wallet && sessions.length ? (
        sessions.map((item) => (
          <div className="settings-row" key={item.id}>
            <div>
              <strong>{item.current ? "This session" : "Signed in " + date(item.created)}</strong>
              <p>Expires {date(item.expires)} UTC</p>
            </div>
            {item.current && <span className="pill">Current</span>}
          </div>
        ))
      ) : (
        <p className="caption" role="status">
          {!wallet ? "Connect a wallet to see active sessions." : "Active sessions are unavailable."}
        </p>
      )}
      {wallet &&
        (signingOut ? (
          <div className="settings-row">
            <div>
              <strong>Sign out other sessions?</strong>
              <p>Other devices will need to sign in again.</p>
            </div>
            <div className="actions">
              <button type="button" className="button quiet" disabled={busy} onClick={signOutOthers}>
                Sign out others
              </button>
              <button type="button" className="button quiet" disabled={busy} onClick={() => setSigningOut(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="button quiet" disabled={busy} onClick={() => setSigningOut(true)}>
              Sign out other sessions
            </button>
          </div>
        ))}
      <Failure message={error} />
      <p role="status" className={notice ? "status" : "visually-hidden"}>
        {notice}
      </p>
    </section>
  );
}

function SettingsContent() {
  const session = useRemote<Session>("session");
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
      const ok = await settings.send({
        type: "saveProfile",
        name: String(fields.get("name") ?? ""),
        username: String(fields.get("username") ?? ""),
      });
      if (ok) setNotice("Profile saved.");
      else setError("Nothing changed to save.");
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
          <form className="settings-row" onSubmit={(event) => void rename(event)} key={wallet + (state?.name ?? "") + (state?.username ?? "")}>
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
      <SessionsPanel wallet={wallet} />
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
    <WorkspaceLegacy>
      <SettingsContent />
    </WorkspaceLegacy>
  );
}
