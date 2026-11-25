// spec/app/console/index.md, "Story: Set up the workspace profile" and "Story: Choose how this device shows the
// console": the workspace identity form, the theme segmented control and the device toggles, over the settings machine.
import { useState, type FormEvent } from "react";
import { Code2, MonitorSmartphone, Settings, Shield } from "lucide-react";
import type { Console, Theme } from "../../../../gen/app__console.ts";
import { Button, Card, Checkbox, Input, cn } from "@repo/ui";
import { useRemote } from "../../remote.ts";
import { useWorkspaceSession } from "./frame.tsx";
import { SignInGate } from "./gate.tsx";
import { CopyButton, WorkspaceHeading, shorten } from "./bits.tsx";

const usernameHelp = "Use 3–24 letters, numbers, or underscores. Start with a letter.";
const themes: { id: Theme; label: string }[] = [
  { id: "System", label: "system" },
  { id: "Light", label: "light" },
  { id: "Dark", label: "dark" },
];

/** A labelled switch row, as the preferences panel shows it. */
function PrefRow({
  name,
  hint,
  checked,
  onToggle,
}: {
  name: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div>
        <strong className="text-sm">{name}</strong>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={name}
        aria-checked={checked}
        onClick={onToggle}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-background transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsSection() {
  const session = useWorkspaceSession();
  const settings = useRemote<Console>("console");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const state = settings.state;

  if (session.state?.tag !== "SignedIn") {
    return <SignInGate message="Connect a Solana wallet to manage your account." />;
  }
  const wallet = session.state.wallet;

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    const fields = new FormData(event.currentTarget);
    const sent = await settings.send({
      type: "saveProfile",
      name: String(fields.get("name") ?? ""),
      username: String(fields.get("username") ?? ""),
    });
    if (sent) setNotice("Profile saved.");
    else setError("Nothing changed to save.");
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <WorkspaceHeading
        icon={Settings}
        title="Settings"
        description="Edit your profile and choose how this device displays the console."
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p role="status" className={notice ? "text-sm text-ok" : "sr-only"}>
        {notice || "No updates."}
      </p>
      <Card aria-label="Workspace identity" className="gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Workspace identity</h2>
          <Shield size={18} aria-hidden className="text-muted-foreground" />
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-border py-3">
          <div className="min-w-0">
            <strong className="text-sm">Solana wallet</strong>
            <p className="truncate font-mono text-xs text-muted-foreground">{shorten(wallet)}</p>
          </div>
          <CopyButton text={wallet} label="Copy address" />
        </div>
        <form className="flex flex-col gap-3 py-2" onSubmit={rename} key={wallet + (state?.name ?? "") + (state?.username ?? "")}>
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <Input name="name" maxLength={60} defaultValue={state?.name ?? ""} placeholder="Your name" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Username
            <Input
              name="username"
              aria-describedby="username-help"
              maxLength={24}
              defaultValue={state?.username ?? ""}
              placeholder="your_username"
              autoCapitalize="none"
              spellCheck={false}
            />
            <span id="username-help" className="text-xs text-muted-foreground">
              {usernameHelp} Shown in referral activity.
            </span>
          </label>
          <div>
            <Button type="submit" variant="outline" size="sm">
              Save profile
            </Button>
          </div>
        </form>
      </Card>
      <Card aria-label="Preferences" className="gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Preferences</h2>
          <Code2 size={18} aria-hidden className="text-muted-foreground" />
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-border py-3">
          <div>
            <strong className="text-sm">Appearance</strong>
            <p className="text-xs text-muted-foreground">Choose the console theme.</p>
          </div>
          <div className="flex rounded-md border border-border bg-muted p-0.5" role="group" aria-label="Theme">
            {themes.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={state?.theme === id}
                onClick={() => void settings.send({ type: "chooseTheme", theme: id })}
                className={cn(
                  "rounded-[5px] px-3 py-1 text-xs text-muted-foreground capitalize",
                  state?.theme === id && "bg-background text-foreground shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <PrefRow
          name="Plain writing"
          hint="Ask the chat model for concise, clear language."
          checked={state?.plain ?? true}
          onToggle={() => void settings.send({ type: "setPlain", on: !(state?.plain ?? true) })}
        />
        <PrefRow
          name="Save on this device"
          hint="Keep playground chat history in this browser."
          checked={state?.saveOnDevice ?? false}
          onToggle={() => void settings.send({ type: "setSaveOnDevice", on: !(state?.saveOnDevice ?? false) })}
        />
      </Card>
      <Card aria-label="Active sessions" className="gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Active sessions</h2>
          <MonitorSmartphone size={18} aria-hidden className="text-muted-foreground" />
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <strong className="text-sm">This session</strong>
            <p className="text-xs text-muted-foreground">Signed in as {shorten(wallet)}</p>
          </div>
          <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">Current</span>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => void session.send({ type: "signOut" })}>
          Sign out of this session
        </Button>
      </Card>
    </div>
  );
}
