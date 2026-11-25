// spec/app/teams.md, "Story: Form a team"; spec/app/keys.md, "Story: Issue a key": teams, members and roles,
// invitations, project budgets, project-scoped keys and the project request table.
import { UsersRound } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Session } from "../../../../gen/app__session.ts";
import type { Project, Role, Team, Teams } from "../../../../gen/app__teams.ts";
import type { Key, Keys } from "../../../../gen/app__keys.ts";
import type { LogEntry, Logs, LogStatus } from "../../../../gen/app__console__logs.ts";
import { useRemote } from "../../remote.ts";
import { CopyButton, WorkspaceHeading, WorkspaceLegacy, creditBalance, creditDecimal, parseCreditAmount, shorten } from "./legacy.tsx";

const roles: Record<Role, string> = { Owner: "Owner", Admin: "Admin", Member: "Member" };
const usageStatuses: Record<LogStatus, string> = {
  Complete: "Charged",
  Failed: "Released",
  Pending: "Reserved",
  Unreported: "Under review",
};
const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const formatTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const sevenDays = 7 * 86_400_000;
const dayMs = 86_400_000;

type SendEvent = (input: unknown) => Promise<boolean>;
type RunAction = (send: SendEvent, event: object, success?: () => void, message?: string) => void;

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Teams") return null;
  return <TeamsWorkspace />;
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel teams-panel" aria-label={title}>
      <h2>{title}</h2>
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
    <form className="teams-form" onSubmit={handle}>
      <fieldset disabled={pending}>
        <legend className="teams-hidden">{label}</legend>
        {children}
        <button className="button accent" type="submit">
          {label}
        </button>
      </fieldset>
    </form>
  );
}

function ConfirmAction({
  label,
  message,
  action,
  pending,
}: {
  label: string;
  message: string;
  action: () => void;
  pending: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        className="button quiet"
        type="button"
        disabled={pending}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialog} className="panel teams-dialog" aria-label={label} onClose={() => trigger.current?.focus()}>
        <h3>{label}</h3>
        <p>{message}</p>
        <div className="teams-row">
          <button className="button quiet" type="button" autoFocus onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            className="button accent"
            type="button"
            disabled={pending}
            onClick={() => {
              dialog.current?.close();
              action();
            }}
          >
            {label}
          </button>
        </div>
      </dialog>
    </>
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
    <label>
      {label}
      <input
        type="number"
        name={name}
        inputMode="decimal"
        min="0.01"
        max="100000"
        step="0.000001"
        defaultValue={initial === undefined || initial === 0 ? "" : creditDecimal(initial)}
        required={required}
      />
    </label>
  );
}

function ProjectBudgetFields({ project }: { project?: Project }) {
  return (
    <>
      <label>
        Project name
        <input name="name" defaultValue={project?.name} maxLength={60} required />
      </label>
      <MoneyInput label="Lifetime budget in USD" name="budget" initial={project?.budget} required />
    </>
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
  entries: LogEntry[];
  keysSend: SendEvent;
  teamsSend: SendEvent;
  pending: boolean;
  run: RunAction;
}) {
  const [newKey, setNewKey] = useState<string>();
  const canManage = role !== "Member" && !project.archived;
  const projectKeys = keys.filter((key) => key.project === project.id && key.status === "Active");
  const keyNames = new Set(projectKeys.map((key) => key.label));
  const requests = entries.filter((entry) => keyNames.has(entry.keyName)).slice(0, 30);
  const now = Date.now();

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
        project: project.id,
        scopes: ["inference"],
        cap,
        dailyCap,
        expiresAt: expiresOn ? Date.parse(expiresOn + "T00:00:00Z") : 0,
        now: Date.now(),
      },
      () => setNewKey(full),
      "Could not create the project key.",
    );
  }

  return (
    <div className="teams-stack">
      <Section title={project.name}>
        {project.archived && <p className="pill">Archived</p>}
        <dl className="teams-metrics">
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
        {canManage && (
          <details>
            <summary>Project settings</summary>
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
              action={() => {
                setNewKey(undefined);
                run(teamsSend, { type: "archiveProject", projectId: project.id, actor: actor }, undefined, "Could not archive the project.");
              }}
            />
          </details>
        )}
      </Section>
      {role !== "Member" && (
        <Section title="Project API keys">
          {canManage && (
            <FieldForm label="Create project key" pending={pending} submit={(fields) => void createKey(fields)}>
              <label>
                Key name
                <input name="name" maxLength={60} required />
              </label>
              <MoneyInput label="Lifetime key cap in USD" name="cap" />
              <MoneyInput label="Daily key cap in USD" name="dailyCap" />
              <label>
                Expires at midnight UTC
                <input name="expiresOn" type="date" />
              </label>
            </FieldForm>
          )}
          {newKey && canManage && (
            <div className="teams-new-key">
              <p role="status">Copy the new key now. This is its only display.</p>
              <code>{newKey}</code>
              <div className="teams-row">
                <CopyButton value={newKey} label="Copy project API key" />
                <button className="button quiet" type="button" onClick={() => setNewKey(undefined)}>
                  Done
                </button>
              </div>
            </div>
          )}
          {projectKeys.length === 0 ? (
            <p className="caption">No project keys.</p>
          ) : (
            <ul className="teams-list">
              {projectKeys.map((key) => (
                <li key={key.id}>
                  <div>
                    <strong>{key.label}</strong>
                    <p className="caption">
                      {key.prefix}… · {creditBalance(key.spent)} used and held
                    </p>
                    <p className="caption">
                      {key.cap === 0 ? "No key lifetime cap" : creditBalance(key.cap) + " lifetime"}
                      {key.dailyCap === 0 ? "" : " · " + creditBalance(key.dailyCap) + " daily"}
                      {key.expiresAt === 0 ? "" : " · Expires " + formatDate.format(key.expiresAt)}
                    </p>
                  </div>
                  {canManage && (
                    <ConfirmAction
                      label="Revoke key"
                      message={`Revoke ${key.label} immediately?`}
                      pending={pending}
                      action={() => run(keysSend, { type: "revoke", id: key.id }, undefined, "Could not revoke the key.")}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <Section title="Recent project requests">
        {requests.length === 0 ? (
          <p className="caption">Project requests will appear here.</p>
        ) : (
          <div className="table-wrap compact-table" tabIndex={0} aria-label="Project request table" role="region">
            <table>
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
                    <th scope="row">
                      <div>{row.model}</div>
                      <p className="caption">{formatTime.format(now - row.ageDays * dayMs)} UTC</p>
                      <code className="teams-reference">{row.id}</code>
                    </th>
                    <td>{row.keyName}</td>
                    <td>
                      {usageStatuses[row.status]}
                      {row.status === "Failed" ? "" : " · " + creditBalance(row.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
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
  entries: LogEntry[];
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
  const now = Date.now();
  const invites = team.invites.filter((invite) => invite.expiresAt > now);

  return (
    <>
      <div className="teams-columns">
        <Section title="Projects">
          <p className="caption">Project requests use the team owner’s compute credits.</p>
          {projects.length > 0 && (
            <label>
              Active or recent archived project
              <select value={project?.id ?? ""} onChange={(event) => setSelectedProject(event.target.value)}>
                {projects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!projects.length && <p className="caption">No projects yet.</p>}
          {canManage && (
            <details open={projects.length === 0}>
              <summary>New project</summary>
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
            </details>
          )}
        </Section>
        <Section title="Members">
          <ul className="teams-list">
            {team.members.map((member) => {
              const self = member.wallet === wallet;
              const removable =
                member.role !== "Owner" &&
                (self || role === "Owner" || (role === "Admin" && member.role === "Member"));
              return (
                <li key={member.wallet}>
                  <div>
                    <span title={member.wallet}>{shorten(member.wallet)}</span>
                    <span className="caption">
                      {" "}
                      · {roles[member.role]}
                      {self ? " · You" : ""}
                    </span>
                  </div>
                  <div className="teams-row">
                    {role === "Owner" && member.role !== "Owner" && (
                      <button
                        className="button quiet"
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
                      </button>
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
            <details>
              <summary>Invite a wallet</summary>
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
                <label>
                  Solana wallet address
                  <input name="wallet" maxLength={44} required autoComplete="off" />
                </label>
                <label>
                  Team role
                  <select name="role">
                    <option value="member">Member</option>
                    {role === "Owner" && <option value="admin">Admin</option>}
                  </select>
                </label>
              </FieldForm>
            </details>
          )}
          {invites.length > 0 && (
            <>
              <h3>Pending invitations</h3>
              <ul className="teams-list">
                {invites.map((invite) => (
                  <li key={invite.wallet}>
                    <div>
                      <span title={invite.wallet}>{shorten(invite.wallet)}</span>
                      <p className="caption">
                        {roles[invite.role]} · Expires {formatDate.format(invite.expiresAt)}
                      </p>
                    </div>
                    {(role === "Owner" || invite.role === "Member") && canManage && (
                      <button
                        className="button quiet"
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
                      </button>
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
  const logs = useRemote<Logs>("console__logs");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const all = teams.state?.teams ?? [];
  const team = all.find(({ id }) => id === selectedTeam) ?? all[0];
  const now = Date.now();
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
      teams.send,
      { type: "createTeam", id, name: field(fields, "name").trim(), actor: wallet, now: Date.now() },
      () => setSelectedTeam(id),
      "Could not create the team.",
    );
  }

  return (
    <div className="teams-stack">
      {teams.error && (
        <div className="teams-row">
          <p role="alert">{teams.error}</p>
          <button className="button quiet" type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {!teams.state && !teams.error && <p role="status">Loading teams…</p>}
      <p role="status" aria-live="polite" className={notice ? "caption" : "teams-hidden"}>
        {notice}
      </p>
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      {teams.state && (
        <>
          <Section title="Your teams">
            {team && (
              <label>
                Team
                <select value={team.id} onChange={(event) => setSelectedTeam(event.target.value)}>
                  {all.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} · {roles[entry.members.find((member) => member.wallet === wallet)?.role ?? "Member"]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <details open={!team}>
              <summary>New team</summary>
              <FieldForm label="Create team" pending={pending} submit={createTeam}>
                <label>
                  Team name
                  <input name="name" maxLength={60} required />
                </label>
              </FieldForm>
            </details>
          </Section>
          {invitations.length > 0 && (
            <Section title="Team invitations">
              <ul className="teams-list">
                {invitations.map((invite) => (
                  <li key={invite.teamId}>
                    <div>
                      <strong>{invite.teamName}</strong>
                      <p className="caption">
                        {roles[invite.role]} · Expires {formatDate.format(invite.expiresAt)}
                      </p>
                    </div>
                    <div className="teams-row">
                      <button
                        className="button accent"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            teams.send,
                            { type: "respond", teamId: invite.teamId, actor: wallet, accept: true, now: Date.now() },
                            () => setSelectedTeam(invite.teamId),
                            "Could not accept the invitation.",
                          )
                        }
                      >
                        Accept
                      </button>
                      <button
                        className="button quiet"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            teams.send,
                            { type: "respond", teamId: invite.teamId, actor: wallet, accept: false, now: Date.now() },
                            undefined,
                            "Could not decline the invitation.",
                          )
                        }
                      >
                        Decline
                      </button>
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
              entries={logs.state?.entries ?? []}
              keysSend={keys.send}
              teamsSend={teams.send}
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
  const session = useRemote<Session>("session");
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
        <SignedInTeams key={wallet + ":" + revision} wallet={wallet} retry={() => setRevision((current) => current + 1)} />
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
    <WorkspaceLegacy>
      <TeamsSession />
    </WorkspaceLegacy>
  );
}
