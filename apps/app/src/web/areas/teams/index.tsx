// spec/app/teams.md, "Story: Form a team"; spec/app/keys.md, "Story: Issue a key": teams, members and roles,
// invitations, project budgets, project-scoped keys and the project request table.
import { Activity, KeyRound, UsersRound } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import { useSession } from "../../session.ts";
import type { Project, Role, Team, Teams } from "../../../../gen/app__teams.ts";
import type { Key, Keys } from "../../../../gen/app__keys.ts";
import type { Row, Status, Usage } from "../../../../gen/app__usage.ts";
import { reconnectMachine, useRemote } from "../../remote.ts";
import { ConsoleFrame } from "../console/frame.tsx";
import { CopyButton, Empty, WorkspaceHeading, creditBalance, creditDecimal, date, dateTime, day, parseCreditAmount, shorten } from "../console/bits.tsx";
import "./teams.css";

const roles: Record<Role, string> = { Owner: "Owner", Admin: "Admin", Member: "Member" };
const usageStatuses: Record<Status, string> = {
  Complete: "Charged",
  Failed: "Released",
  Pending: "Reserved",
  Unreported: "Under review",
};
const sevenDays = 7 * 86_400_000;
const budgetWarningRatio = 0.8;

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
    <section className={`panel teams-panel ${className}`} aria-label={title}>
      <div className="teams-panel-head">
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
    <form className="teams-form" onSubmit={handle}>
      <fieldset disabled={pending}>
        <legend className="visually-hidden">{label}</legend>
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
  danger,
}: {
  label: string;
  message: string;
  action: () => void;
  pending: boolean;
  danger?: boolean;
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
            className={danger ? "button danger" : "button accent"}
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
    <div className="teams-stack">
      <Section
        title={project.name}
        aside={
          project.archived && (
            <span className="pill teams-status" data-status="Archived">
              Archived
            </span>
          )
        }
      >
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
        <div
          className="teams-budget-meter"
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
          <details className="teams-disclosure">
            <summary>Project settings</summary>
            <div className="teams-disclosure-body">
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
            <details className="teams-disclosure">
              <summary>New project key</summary>
              <div className="teams-disclosure-body">
                <FieldForm label="Create project key" pending={pending} submit={(fields) => void createKey(fields)}>
                  <label>
                    Key name
                    <input name="name" maxLength={60} required />
                  </label>
                  <MoneyInput label="Lifetime key cap in USD" name="cap" />
                  <MoneyInput label="Daily key cap in USD" name="dailyCap" />
                  <label>
                    Expires at end of day UTC
                    <input name="expiresOn" type="date" min={day(now)} />
                  </label>
                </FieldForm>
              </div>
            </details>
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
            <Empty title="No keys yet" icon={<KeyRound size={22} />}>
              <p>Create a key to start project inference.</p>
            </Empty>
          ) : (
            <div className="table-wrap compact-table workspace-data-table data-rows" tabIndex={0} aria-label="Project key table" role="region">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    <th scope="col">Usage</th>
                    <th scope="col">Limits</th>
                    {canManage && <th scope="col" className="teams-actions-head">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {projectKeys.map((key) => (
                    <tr key={key.id}>
                      <th scope="row">
                        <div className="teams-key-title">
                          <strong>{key.label}</strong>
                          <code>{key.prefix}…</code>
                        </div>
                      </th>
                      <td data-label="Used and held" className="teams-number">
                        {creditBalance(key.spent)}
                      </td>
                      <td data-label="Limits">
                        <div className="teams-key-limits">
                          <div>{key.cap === 0 ? "No lifetime cap" : creditBalance(key.cap) + " lifetime"}</div>
                          {key.dailyCap !== 0 && <div>{creditBalance(key.dailyCap)} daily</div>}
                          {key.expiresAt !== 0 && <div>Expires {date(key.expiresAt)}</div>}
                        </div>
                      </td>
                      {canManage && (
                        <td data-label="Actions" data-span className="teams-table-actions">
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
      <Section title="Recent project requests">
        <p className="caption">Teammates can review every request made with this project's keys.</p>
        {requests.length === 0 ? (
          <Empty title="No requests yet" icon={<Activity size={22} />}>
            <p>Requests will appear here.</p>
          </Empty>
        ) : (
          <div className="table-wrap compact-table workspace-data-table data-rows" tabIndex={0} aria-label="Project request table" role="region">
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
                    <th scope="row" className="teams-request">
                      <div>{row.model}</div>
                      <p className="caption">{dateTime(row.time)}</p>
                      <code className="teams-reference">{row.id}</code>
                    </th>
                    <td data-label="Key">{row.keyName}</td>
                    <td data-label="Billing" data-span>
                      <div className="teams-billing">
                        <span className="pill teams-status" data-status={row.status}>
                          {usageStatuses[row.status]}
                        </span>
                        {row.status !== "Failed" && <span className="teams-number">{creditBalance(row.cost)}</span>}
                      </div>
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
  const now = Date.now();
  const invites = team.invites.filter((invite) => invite.expiresAt > now);

  return (
    <>
      <div className="teams-columns">
        <Section title="Projects">
          <p className="caption">Project requests spend the credits of the wallet that created the key.</p>
          {projects.length > 0 && (
            <label>
              Project
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
            <details className="teams-disclosure" open={projects.length === 0}>
              <summary>New project</summary>
              <div className="teams-disclosure-body">
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
          <ul className="teams-list">
            {team.members.map((member) => {
              const self = member.wallet === wallet;
              const removable =
                member.role !== "Owner" &&
                (self || role === "Owner" || (role === "Admin" && member.role === "Member"));
              return (
                <li key={member.wallet}>
                  <div className="teams-member-identity">
                    <span className="teams-wallet" title={member.wallet}>{shorten(member.wallet)}</span>
                    <span className="caption">{roles[member.role]}</span>
                    {self && <span className="pill teams-self">You</span>}
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
            <details className="teams-disclosure">
              <summary>Invite a wallet</summary>
              <div className="teams-disclosure-body">
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
              </div>
            </details>
          )}
          {invites.length > 0 && (
            <>
              <h3>Pending invitations</h3>
              <ul className="teams-list">
                {invites.map((invite) => (
                  <li key={invite.wallet}>
                    <div className="teams-member-identity">
                      <span className="teams-wallet" title={invite.wallet}>{shorten(invite.wallet)}</span>
                      <span className="caption">{roles[invite.role]}</span>
                      <span className="caption">Expires {date(invite.expiresAt)}</span>
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
  const usage = useRemote<Usage>("usage");
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
      <p role="status" aria-live="polite" className={notice ? "caption" : "visually-hidden"}>
        {notice}
      </p>
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      {teams.state && (
        <>
          <Section title="Your teams" className={team ? "teams-overview-panel" : "teams-overview-panel teams-overview-empty"}>
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
            <details className="teams-disclosure" open={!team}>
              <summary>New team</summary>
              <div className="teams-disclosure-body">
                <FieldForm label="Create team" pending={pending} submit={createTeam}>
                  <label>
                    Team name
                    <input name="name" maxLength={60} required />
                  </label>
                </FieldForm>
              </div>
            </details>
          </Section>
          {invitations.length > 0 && (
            <Section title="Team invitations">
              <ul className="teams-list">
                {invitations.map((invite) => (
                  <li key={invite.teamId}>
                    <div className="teams-member-identity">
                      <strong>{invite.teamName}</strong>
                      <span className="caption">{roles[invite.role]}</span>
                      <span className="caption">Expires {date(invite.expiresAt)}</span>
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
              entries={usage.state?.rows ?? []}
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
    <div className="workspace-surface">
      <TeamsSession />
    </div>
  );
}
