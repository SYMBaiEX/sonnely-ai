// spec/app/teams.md, "Story: Form a team"; spec/app/keys.md, "Story: Issue a key"
import { Activity, KeyRound, UsersRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import { useSession } from "../../session.ts";
import type { Project, Role, Team, Teams } from "../../../../gen/app__teams.ts";
import type { Key, Keys } from "../../../../gen/app__keys.ts";
import type { Row, Status, Usage } from "../../../../gen/app__usage.ts";
import { reconnectMachine, useRemote } from "../../remote.ts";
import { Button, Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger, Input, Label, Select } from "@repo/ui";
import { ConsoleFrame } from "../console/frame.tsx";
import { CopyButton, Empty, WorkspaceHeading, creditBalance, creditDecimal, date, dateTime, day, parseCreditAmount, shorten } from "../console/bits.tsx";

const roles: Record<Role, string> = { Owner: "Owner", Admin: "Admin", Member: "Member" };
const usageStatuses: Record<Status, string> = {
  Complete: "Charged",
  Failed: "Released",
  Pending: "Reserved",
  Unreported: "Under review",
};
const sevenDays = 7 * 86_400_000;
const budgetWarningRatio = 0.8;
const summaryClass = "cursor-pointer px-4 py-3 text-ui font-medium outline-none focus-visible:outline-2 focus-visible:outline-ring";

type SendEvent = (input: unknown) => Promise<boolean>;
type RunAction = (send: SendEvent, event: object, success?: () => void, message?: string) => void;

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Teams") return null;
  return (
    <ConsoleFrame section="Teams">
      <TeamsWorkspace />
    </ConsoleFrame>
  );
}

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function money(data: FormData, name: string) {
  const value = field(data, name).trim();
  return value ? parseCreditAmount(value) : 0;
}

function budget(data: FormData) {
  return parseCreditAmount(field(data, "budget")) ?? -1;
}

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";

function secret() {
  const bytes = crypto.getRandomValues(new Uint8Array(43));
  return "sonnely_live_" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function Section({ title, aside, className = "", children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm ${className}`} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FieldForm({
  submit,
  pending,
  label,
  children,
}: {
  submit: (data: FormData) => void;
  pending: boolean;
  label: string;
  children: ReactNode;
}) {
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  }
  return (
    <form className="grid gap-3" onSubmit={handle}>
      <fieldset disabled={pending}>
        <legend className="sr-only">{label}</legend>
        {children}
        <Button type="submit">
          {label}
        </Button>
      </fieldset>
    </form>
  );
}

function ConfirmAction({
  label,
  message,
  action,
  pending,
  danger,
}: {
  label: string;
  message: string;
  action: () => void;
  pending: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{label}</DialogTitle>
        <p className="text-ui text-muted-foreground">{message}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant={danger ? "destructive" : "primary"} disabled={pending} onClick={action}>
              {label}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MoneyInput({
  label,
  name,
  initial,
  required,
}: {
  label: string;
  name: string;
  initial?: number;
  required?: boolean;
}) {
  return (
    <Label className="grid gap-2 text-ui font-medium text-foreground">
      {label}
      <Input
        type="number"
        name={name}
        inputMode="decimal"
        min="0.01"
        max="100000"
        step="0.000001"
        defaultValue={initial === undefined || initial === 0 ? "" : creditDecimal(initial)}
        required={required}
      />
    </Label>
  );
}

function ProjectBudgetFields({ project }: { project?: Project }) {
  return (
    <>
      <Label className="grid gap-2 text-ui font-medium text-foreground">
        Project name
        <Input name="name" defaultValue={project?.name} maxLength={60} required />
      </Label>
      <MoneyInput label="Lifetime budget in USD" name="budget" initial={project?.budget} required />
    </>
  );
}

function ProjectRequests({ requests }: { requests: Row[] }) {
  return (
    <Section title="Recent project requests">
      <p className="text-meta text-muted-foreground">Teammates can review every request made with this project's keys.</p>
      {requests.length === 0 ? (
        <Empty title="No requests yet" icon={<Activity size={22} />}>
          <p>Requests will appear here.</p>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} aria-label="Project request table" role="region">
          <table className="w-full border-collapse bg-card text-ui">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Key</th>
                <th scope="col">Billing</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="min-w-48 font-medium">
                    <div>{row.model}</div>
                    <p className="text-meta text-muted-foreground">{dateTime(row.time)}</p>
                    <code className="font-mono text-micro text-muted-foreground">{row.id}</code>
                  </th>
                  <td data-label="Key">{row.keyName}</td>
                  <td data-label="Billing" data-span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="inline-flex items-center rounded-xl border border-info/40 bg-info/10 px-2 py-0.5 text-micro font-medium text-info" data-status={row.status}>
                        {usageStatuses[row.status]}
                      </span>
                      {row.status !== "Failed" && <span className="text-right font-medium tabular-nums">{creditBalance(row.cost)}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function ProjectWorkspace({
  project,
  actor,
  role,
  keys,
  entries,
  keysSend,
  teamsSend,
  pending,
  run,
}: {
  project: Project;
  actor: string;
  role: Role;
  keys: Key[];
  entries: Row[];
  keysSend: SendEvent;
  teamsSend: SendEvent;
  pending: boolean;
  run: RunAction;
}) {
  const [newKey, setNewKey] = useState<string>();
  const [now] = useState(() => Date.now());
  const canManage = role !== "Member" && !project.archived;
  const projectKeys = keys.filter((key) => key.project === project.id && key.status === "Active");
  const requests = entries.filter((entry) => entry.project === project.id).slice(0, 30);
  const budgetRatio = project.budget <= 0 ? 0 : project.spent / project.budget;
  const budgetPercent = Math.min(Math.max(budgetRatio, 0), 1) * 100;
  const budgetState = project.spent > project.budget ? "over" : budgetRatio >= budgetWarningRatio ? "warning" : "within";

  async function createKey(fields: FormData) {
    const name = field(fields, "name").trim();
    const cap = money(fields, "cap");
    const dailyCap = money(fields, "dailyCap");
    const expiresOn = field(fields, "expiresOn");
    if (!name || cap === null || dailyCap === null) return;
    const full = secret();
    const hash = await sha256(full);
    run(
      keysSend,
      {
        type: "create",
        id: crypto.randomUUID(),
        label: name,
        prefix: full.slice(0, 20),
        hash,
        wallet: actor,
        project: project.id,
        scopes: ["inference"],
        cap,
        dailyCap,
        expiresAt: expiresOn ? Date.parse(expiresOn + "T23:59:59Z") : 0,
        now: Date.now(),
      },
      () => setNewKey(full),
      "Could not create the project key.",
    );
  }

  return (
    <div className="grid gap-3">
      <Section
        title={project.name}
        aside={
          project.archived && (
            <span className="inline-flex items-center rounded-xl border border-info/40 bg-info/10 px-2 py-0.5 text-micro font-medium text-info" data-status="Archived">
              Archived
            </span>
          )
        }
      >
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt>Budget</dt>
            <dd>{creditBalance(project.budget)}</dd>
          </div>
          <div>
            <dt>Used and held</dt>
            <dd>{creditBalance(project.spent)}</dd>
          </div>
          <div>
            <dt>Budget remaining</dt>
            <dd>{creditBalance(Math.max(project.budget - project.spent, 0))}</dd>
          </div>
        </dl>
        <div
          className="h-2 overflow-hidden rounded-xl bg-background"
          data-state={budgetState}
          role="meter"
          aria-label="Project budget used and held"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(budgetRatio, 1) * 100)}
        >
          <span style={{ width: `${budgetPercent}%` }} />
        </div>
        {canManage && (
          <details className="rounded-lg border border-border bg-background open:bg-card">
            <summary className={summaryClass}>Project settings</summary>
            <div className="grid gap-3 border-t border-border px-4 py-4">
              <FieldForm
                label="Save project"
                pending={pending}
                submit={(fields) => {
                  const amount = budget(fields);
                  if (amount < 10_000) return;
                  run(
                    teamsSend,
                    {
                      type: "updateProject",
                      projectId: project.id,
                      actor: actor,
                      name: field(fields, "name").trim(),
                      budget: amount,
                    },
                    undefined,
                    "Could not save the project.",
                  );
                }}
              >
                <ProjectBudgetFields key={project.name + ":" + project.budget} project={project} />
              </FieldForm>
              <ConfirmAction
                label="Archive project"
                message="Project keys will stop accepting new requests. Existing reservations can still settle."
                pending={pending}
                danger
                action={() => {
                  setNewKey(undefined);
                  run(teamsSend, { type: "archiveProject", projectId: project.id, actor: actor }, undefined, "Could not archive the project.");
                }}
              />
            </div>
          </details>
        )}
      </Section>
      {role !== "Member" && (
        <Section title="Project API keys">
          {canManage && (
            <details className="rounded-lg border border-border bg-background open:bg-card">
              <summary className={summaryClass}>New project key</summary>
              <div className="grid gap-3 border-t border-border px-4 py-4">
                <FieldForm label="Create project key" pending={pending} submit={(fields) => void createKey(fields)}>
                  <Label className="grid gap-2 text-ui font-medium text-foreground">
                    Key name
                    <Input name="name" maxLength={60} required />
                  </Label>
                  <MoneyInput label="Lifetime key cap in USD" name="cap" />
                  <MoneyInput label="Daily key cap in USD" name="dailyCap" />
                  <Label className="grid gap-2 text-ui font-medium text-foreground">
                    Expires at end of day UTC
                    <Input name="expiresOn" type="date" min={day(now)} />
                  </Label>
                </FieldForm>
              </div>
            </details>
          )}
          {newKey && canManage && (
            <div className="grid gap-2 rounded-lg border border-info/40 bg-info/10 p-3">
              <p role="status">Copy the new key now. This is its only display.</p>
              <code>{newKey}</code>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <CopyButton value={newKey} label="Copy project API key" />
                <Button variant="outline" type="button" onClick={() => setNewKey(undefined)}>
                  Done
                </Button>
              </div>
            </div>
          )}
          {projectKeys.length === 0 ? (
            <Empty title="No keys yet" icon={<KeyRound size={22} />}>
              <p>Create a key to start project inference.</p>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} aria-label="Project key table" role="region">
              <table className="w-full border-collapse bg-card text-ui">
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    <th scope="col">Usage</th>
                    <th scope="col">Limits</th>
                    {canManage && <th scope="col" className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {projectKeys.map((key) => (
                    <tr key={key.id}>
                      <th scope="row">
                        <div className="grid gap-1">
                          <strong>{key.label}</strong>
                          <code>{key.prefix}…</code>
                        </div>
                      </th>
                      <td data-label="Used and held" className="text-right font-medium tabular-nums">
                        {creditBalance(key.spent)}
                      </td>
                      <td data-label="Limits">
                        <div className="grid gap-1 text-meta text-muted-foreground">
                          <div>{key.cap === 0 ? "No lifetime cap" : creditBalance(key.cap) + " lifetime"}</div>
                          {key.dailyCap !== 0 && <div>{creditBalance(key.dailyCap)} daily</div>}
                          {key.expiresAt !== 0 && <div>Expires {date(key.expiresAt)}</div>}
                        </div>
                      </td>
                      {canManage && (
                        <td data-label="Actions" data-span className="text-right">
                          <ConfirmAction
                            label="Revoke key"
                            message={`Revoke ${key.label} immediately?`}
                            pending={pending}
                            danger
                            action={() => run(keysSend, { type: "revoke", id: key.id }, undefined, "Could not revoke the key.")}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
      <ProjectRequests requests={requests} />
    </div>
  );
}

function TeamWorkspace({
  team,
  wallet,
  keys,
  entries,
  keysSend,
  teamsSend,
  pending,
  run,
}: {
  team: Team;
  wallet: string;
  keys: Key[];
  entries: Row[];
  keysSend: SendEvent;
  teamsSend: SendEvent;
  pending: boolean;
  run: RunAction;
}) {
  const [selectedProject, setSelectedProject] = useState("");
  const role = team.members.find((member) => member.wallet === wallet)?.role ?? "Member";
  const canManage = role !== "Member";
  const projects = team.projects;
  const project = projects.find((entry) => entry.id === selectedProject) ?? projects[0];
  const [now] = useState(() => Date.now());
  const invites = team.invites.filter((invite) => invite.expiresAt > now);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Projects">
          <p className="text-meta text-muted-foreground">Project requests spend the credits of the wallet that created the key.</p>
          {projects.length > 0 && (
            <Label className="grid gap-2 text-ui font-medium text-foreground">
              Project
              <Select value={project?.id ?? ""} onChange={(event) => setSelectedProject(event.target.value)}>
                {projects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.archived ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
            </Label>
          )}
          {!projects.length && <p className="text-meta text-muted-foreground">No projects yet.</p>}
          {canManage && (
            <details className="rounded-lg border border-border bg-background open:bg-card" open={projects.length === 0}>
              <summary className={summaryClass}>New project</summary>
              <div className="grid gap-3 border-t border-border px-4 py-4">
                <FieldForm
                  label="Create project"
                  pending={pending}
                  submit={(fields) => {
                    const amount = budget(fields);
                    if (amount < 10_000) return;
                    const id = crypto.randomUUID();
                    run(
                      teamsSend,
                      {
                        type: "createProject",
                        teamId: team.id,
                        projectId: id,
                        actor: wallet,
                        name: field(fields, "name").trim(),
                        budget: amount,
                      },
                      () => setSelectedProject(id),
                      "Could not create the project.",
                    );
                  }}
                >
                  <ProjectBudgetFields />
                </FieldForm>
              </div>
            </details>
          )}
        </Section>
        <Section title="Members">
          <ul className="grid gap-3">
            {team.members.map((member) => {
              const self = member.wallet === wallet;
              const removable =
                member.role !== "Owner" &&
                (self || role === "Owner" || (role === "Admin" && member.role === "Member"));
              return (
                <li key={member.wallet}>
                  <div className="grid min-w-0 gap-1">
                    <span className="font-mono text-ui font-medium text-foreground" title={member.wallet}>{shorten(member.wallet)}</span>
                    <span className="text-meta text-muted-foreground">{roles[member.role]}</span>
                    {self && <span className="inline-flex items-center rounded-xl border border-info/40 bg-info/10 px-2 py-0.5 text-micro font-medium text-info">You</span>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {role === "Owner" && member.role !== "Owner" && (
                      <Button variant="outline"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            teamsSend,
                            {
                              type: "changeRole",
                              teamId: team.id,
                              actor: wallet,
                              wallet: member.wallet,
                              role: member.role === "Admin" ? "Member" : "Admin",
                            },
                            undefined,
                            "Could not change the role.",
                          )
                        }
                      >
                        {member.role === "Admin" ? "Make member" : "Make admin"}
                      </Button>
                    )}
                    {removable && (
                      <ConfirmAction
                        label={self ? "Leave team" : "Remove"}
                        message={
                          self
                            ? "Leave this team and lose access to its projects?"
                            : `Remove ${shorten(member.wallet)} from this team?`
                        }
                        pending={pending}
                        danger
                        action={() =>
                          run(
                            teamsSend,
                            { type: "removeMember", teamId: team.id, actor: wallet, wallet: member.wallet },
                            undefined,
                            self ? "Could not leave the team." : "Could not remove the member.",
                          )
                        }
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {canManage && (
            <details className="rounded-lg border border-border bg-background open:bg-card">
              <summary className={summaryClass}>Invite a wallet</summary>
              <div className="grid gap-3 border-t border-border px-4 py-4">
                <FieldForm
                  label="Send invitation"
                  pending={pending}
                  submit={(fields) => {
                    const invitedAt = Date.now();
                    run(
                      teamsSend,
                      {
                        type: "invite",
                        teamId: team.id,
                        actor: wallet,
                        wallet: field(fields, "wallet").trim(),
                        role: field(fields, "role") === "admin" ? "Admin" : "Member",
                        expiresAt: invitedAt + sevenDays,
                        now: invitedAt,
                      },
                      undefined,
                      "Could not send the invitation.",
                    );
                  }}
                >
                  <Label className="grid gap-2 text-ui font-medium text-foreground">
                    Solana wallet address
                    <Input name="wallet" maxLength={44} required autoComplete="off" />
                  </Label>
                  <Label className="grid gap-2 text-ui font-medium text-foreground">
                    Team role
                    <Select name="role">
                      <option value="member">Member</option>
                      {role === "Owner" && <option value="admin">Admin</option>}
                    </Select>
                  </Label>
                </FieldForm>
              </div>
            </details>
          )}
          {invites.length > 0 && (
            <>
              <h3>Pending invitations</h3>
              <ul className="grid gap-3">
                {invites.map((invite) => (
                  <li key={invite.wallet}>
                    <div className="grid min-w-0 gap-1">
                      <span className="font-mono text-ui font-medium text-foreground" title={invite.wallet}>{shorten(invite.wallet)}</span>
                      <span className="text-meta text-muted-foreground">{roles[invite.role]}</span>
                      <span className="text-meta text-muted-foreground">Expires {date(invite.expiresAt)}</span>
                    </div>
                    {(role === "Owner" || invite.role === "Member") && canManage && (
                      <Button variant="outline"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            teamsSend,
                            { type: "cancelInvite", teamId: team.id, actor: wallet, wallet: invite.wallet },
                            undefined,
                            "Could not cancel the invitation.",
                          )
                        }
                      >
                        Cancel invite
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </div>
      {project && (
        <ProjectWorkspace
          key={project.id}
          project={project}
          actor={wallet}
          role={role}
          keys={keys}
          entries={entries}
          keysSend={keysSend}
          teamsSend={teamsSend}
          pending={pending}
          run={run}
        />
      )}
    </>
  );
}

function SignedInTeams({ wallet, retry }: { wallet: string; retry: () => void }) {
  const teams = useRemote<Teams>("teams");
  const keys = useRemote<Keys>("workspace-keys");
  const usage = useRemote<Usage>("usage");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const sendTeamEvent: SendEvent = (input) => teams.send(input);
  const sendKeyEvent: SendEvent = (input) => keys.send(input);
  const all = teams.state?.teams ?? [];
  const team = all.find(({ id }) => id === selectedTeam) ?? all[0];
  const [now] = useState(() => Date.now());
  const invitations = all.flatMap((entry) =>
    entry.invites
      .filter((invite) => invite.wallet === wallet && invite.expiresAt > now)
      .map((invite) => ({ ...invite, teamName: entry.name, teamId: entry.id })),
  );

  const run: RunAction = (send, event, success, message = "The change was not allowed.") => {
    if (pending) return;
    setPending(true);
    setFailure("");
    setNotice("");
    void send(event)
      .then((ok) => {
        if (!ok) {
          setFailure(message);
          return;
        }
        success?.();
        setNotice("Changes saved.");
      })
      .finally(() => setPending(false));
  };

  function createTeam(fields: FormData) {
    const id = crypto.randomUUID();
    run(
      sendTeamEvent,
      { type: "createTeam", id, name: field(fields, "name").trim(), actor: wallet, now: Date.now() },
      () => setSelectedTeam(id),
      "Could not create the team.",
    );
  }

  return (
    <div className="grid gap-3">
      {teams.error && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p role="alert">{teams.error}</p>
          <Button variant="outline" type="button" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
      {!teams.state && !teams.error && <p role="status">Loading teams…</p>}
      <p role="status" aria-live="polite" className={notice ? "rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-ui text-ok" : "sr-only"}>
        {notice}
      </p>
      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-ui text-destructive">
          {failure}
        </p>
      )}
      {teams.state && (
        <>
          <Section title="Your teams">
            {team && (
              <Label className="grid gap-2 text-ui font-medium text-foreground">
                Team
                <Select value={team.id} onChange={(event) => setSelectedTeam(event.target.value)}>
                  {all.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} · {roles[entry.members.find((member) => member.wallet === wallet)?.role ?? "Member"]}
                    </option>
                  ))}
                </Select>
              </Label>
            )}
            <details className="rounded-lg border border-border bg-background open:bg-card" open={!team}>
              <summary className={summaryClass}>New team</summary>
              <div className="grid gap-3 border-t border-border px-4 py-4">
                <FieldForm label="Create team" pending={pending} submit={createTeam}>
                  <Label className="grid gap-2 text-ui font-medium text-foreground">
                    Team name
                    <Input name="name" maxLength={60} required />
                  </Label>
                </FieldForm>
              </div>
            </details>
          </Section>
          {invitations.length > 0 && (
            <Section title="Team invitations">
              <ul className="grid gap-3">
                {invitations.map((invite) => (
                  <li key={invite.teamId}>
                    <div className="grid min-w-0 gap-1">
                      <strong>{invite.teamName}</strong>
                      <span className="text-meta text-muted-foreground">{roles[invite.role]}</span>
                      <span className="text-meta text-muted-foreground">Expires {date(invite.expiresAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            sendTeamEvent,
                            { type: "respond", teamId: invite.teamId, actor: wallet, accept: true, now: Date.now() },
                            () => setSelectedTeam(invite.teamId),
                            "Could not accept the invitation.",
                          )
                        }
                      >
                        Accept
                      </Button>
                      <Button variant="outline"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            sendTeamEvent,
                            { type: "respond", teamId: invite.teamId, actor: wallet, accept: false, now: Date.now() },
                            undefined,
                            "Could not decline the invitation.",
                          )
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {team && (
            <TeamWorkspace
              key={team.id}
              team={team}
              wallet={wallet}
              keys={keys.state?.keys ?? []}
              entries={usage.state?.rows ?? []}
              keysSend={sendKeyEvent}
              teamsSend={sendTeamEvent}
              pending={pending}
              run={run}
            />
          )}
        </>
      )}
    </div>
  );
}

function TeamsSession() {
  const session = useSession();
  const [revision, setRevision] = useState(0);
  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  return (
    <>
      <WorkspaceHeading
        icon={UsersRound}
        title="Teams"
        description="Manage wallet access, project budgets, and scoped API keys."
      />
      {wallet ? (
        <SignedInTeams key={wallet + ":" + revision} wallet={wallet} retry={() => { reconnectMachine("teams"); setRevision((current) => current + 1); }} />
      ) : (
        <Section title="Wallet required">
          <p>Connect your Solana wallet to create a team or accept an invitation.</p>
        </Section>
      )}
    </>
  );
}

export function TeamsWorkspace() {
  return (
    <div className="grid min-w-0 gap-3 text-foreground">
      <TeamsSession />
    </div>
  );
}
