"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { UsersRound } from "lucide-react";
import type { api } from "@/convex/_generated/api";
import { creditBalance, creditDecimal } from "@/lib/credit-amount";
import { shorten } from "@/lib/models";
import { WorkspaceHeading } from "./workspace-heading";
import { CopyButton } from "./shared";
import { request } from "./wallet";
import styles from "./teams.module.css";

type Overview = FunctionReturnType<typeof api.teams.list>;
type Team = FunctionReturnType<typeof api.teams.detail>;
type Project = FunctionReturnType<typeof api.teams.projectDetail>;
type TeamAction = { action: string; [field: string]: string | boolean | null };
type RunAction = <T>(action: TeamAction, success?: (value: T) => void) => void;

const roles = { owner: "Owner", admin: "Admin", member: "Member" } as const;
const usageStatuses = {
  complete: "Charged",
  failed: "Released",
  pending: "Reserved",
  unreported: "Under review",
} as const;
const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const formatTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function useTeamData<T>(path: string, revision: number) {
  const [result, setResult] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let active = true;
    void request<T>(path).then(
      (data) => active && setResult({ data }),
      (error: Error) => active && setResult({ error: error.message }),
    );
    return () => {
      active = false;
    };
  }, [path, revision]);
  return result;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`panel ${styles.panel}`} aria-label={title}>
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
    <form className={styles.form} onSubmit={handle}>
      <fieldset disabled={pending}>
        <legend className={styles.hidden}>{label}</legend>
        {children}
        <button className="button accent" type="submit">
          {label}
        </button>
      </fieldset>
    </form>
  );
}

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
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
      <dialog
        ref={dialog}
        className={`panel ${styles.dialog}`}
        aria-label={label}
        onClose={() => trigger.current?.focus()}
      >
        <h3>{label}</h3>
        <p>{message}</p>
        <div className={styles.row}>
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
        defaultValue={initial === undefined ? "" : creditDecimal(initial)}
        required={required}
      />
    </label>
  );
}

function ProjectBudgetFields({ project }: { project?: Project["project"] }) {
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
  id,
  revision,
  pending,
  run,
}: {
  id: string;
  revision: number;
  pending: boolean;
  run: RunAction;
}) {
  const { data, error } = useTeamData<Project>("teams?project=" + encodeURIComponent(id), revision);
  const [newKey, setNewKey] = useState<string>();
  if (!data) return <p role={error ? "alert" : "status"}>{error ?? "Loading project…"}</p>;
  const { project, role, keys, requests } = data;
  const canManage = role !== "member" && !project.archived;
  return (
    <div className={styles.stack}>
      <Section title={project.name}>
        {project.archived && <p className="pill">Archived</p>}
        <dl className={styles.metrics}>
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
              submit={(fields) =>
                run({
                  action: "update-project",
                  project: id,
                  name: field(fields, "name"),
                  budget: field(fields, "budget"),
                })
              }
            >
              <ProjectBudgetFields key={project.name + ":" + project.budget} project={project} />
            </FieldForm>
            <ConfirmAction
              label="Archive project"
              message="Project keys will stop accepting new requests. Existing reservations can still settle."
              pending={pending}
              action={() => {
                setNewKey(undefined);
                run({ action: "archive-project", project: id });
              }}
            />
          </details>
        )}
      </Section>
      {role !== "member" && (
        <Section title="Project API keys">
          {canManage && (
            <FieldForm
              label="Create project key"
              pending={pending}
              submit={(fields) =>
                run<{ key: string }>(
                  {
                    action: "create-key",
                    project: id,
                    name: field(fields, "name"),
                    cap: field(fields, "cap") || null,
                    dailyCap: field(fields, "dailyCap") || null,
                    expiresOn: field(fields, "expiresOn") || null,
                  },
                  ({ key }) => setNewKey(key),
                )
              }
            >
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
            <div className={styles.newKey}>
              <p role="status">Copy the new key now. This is its only display.</p>
              <code>{newKey}</code>
              <div className={styles.row}>
                <CopyButton value={newKey} label="Copy project API key" />
                <button className="button quiet" type="button" onClick={() => setNewKey(undefined)}>
                  Done
                </button>
              </div>
            </div>
          )}
          {keys.length === 0 ? (
            <p className="caption">No project keys.</p>
          ) : (
            <ul className={styles.list}>
              {keys.map((key) => (
                <li key={key.id}>
                  <div>
                    <strong>{key.name}</strong>
                    <p className="caption">
                      {key.prefix}… · {creditBalance(key.lifetime)} used and held
                    </p>
                    <p className="caption">
                      {key.cap === null ? "No key lifetime cap" : creditBalance(key.cap) + " lifetime"}
                      {key.dailyCap === null ? "" : " · " + creditBalance(key.dailyCap) + " daily"}
                      {key.expires === null ? "" : " · Expires " + formatDate.format(key.expires)}
                    </p>
                  </div>
                  {canManage && (
                    <ConfirmAction
                      label="Revoke key"
                      message={`Revoke ${key.name} immediately?`}
                      pending={pending}
                      action={() => run({ action: "revoke-key", project: id, key: key.id })}
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
          <div
            className="table-wrap compact-table"
            tabIndex={0}
            aria-label="Project request table"
            role="region"
          >
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
                      <p className="caption">{formatTime.format(row.time)} UTC</p>
                      <code className={styles.reference}>{row.id}</code>
                    </th>
                    <td>{row.keyName}</td>
                    <td>
                      {usageStatuses[row.status]}
                      {row.status === "failed" ? "" : " · " + creditBalance(row.cost)}
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
  id,
  wallet,
  revision,
  pending,
  run,
}: {
  id: string;
  wallet: string;
  revision: number;
  pending: boolean;
  run: RunAction;
}) {
  const { data, error } = useTeamData<Team>("teams?team=" + encodeURIComponent(id), revision);
  const [selectedProject, setSelectedProject] = useState("");
  if (!data) return <p role={error ? "alert" : "status"}>{error ?? "Loading team…"}</p>;
  const { team, members, invites, projects } = data;
  const canManage = team.role !== "member";
  const projectId = projects.find((project) => project.id === selectedProject)?.id ?? projects[0]?.id;
  return (
    <>
      <div className={styles.teamColumns}>
        <Section title="Projects">
          <p className="caption">Project requests use the team owner’s compute credits.</p>
          {projects.length > 0 && (
            <label>
              Active or recent archived project
              <select value={projectId} onChange={(event) => setSelectedProject(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.archived ? " (archived)" : ""}
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
                submit={(fields) =>
                  run<{ id: string }>(
                    {
                      action: "create-project",
                      team: id,
                      name: field(fields, "name"),
                      budget: field(fields, "budget"),
                    },
                    ({ id: created }) => setSelectedProject(created),
                  )
                }
              >
                <ProjectBudgetFields />
              </FieldForm>
            </details>
          )}
        </Section>
        <Section title="Members">
          <ul className={styles.list}>
            {members.map((member) => {
              const self = member.wallet === wallet;
              const removable =
                member.role !== "owner" &&
                (self || team.role === "owner" || (team.role === "admin" && member.role === "member"));
              return (
                <li key={member.account}>
                  <div>
                    <span title={member.wallet}>{shorten(member.wallet)}</span>
                    <span className="caption">
                      {" "}
                      · {roles[member.role]}
                      {self ? " · You" : ""}
                    </span>
                  </div>
                  <div className={styles.row}>
                    {team.role === "owner" && member.role !== "owner" && (
                      <button
                        className="button quiet"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run({
                            action: "change-member",
                            team: id,
                            account: member.account,
                            role: member.role === "admin" ? "member" : "admin",
                          })
                        }
                      >
                        {member.role === "admin" ? "Make member" : "Make admin"}
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
                          run({ action: "change-member", team: id, account: member.account, role: null })
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
                submit={(fields) =>
                  run({
                    action: "invite",
                    team: id,
                    wallet: field(fields, "wallet"),
                    role: field(fields, "role"),
                  })
                }
              >
                <label>
                  Solana wallet address
                  <input name="wallet" maxLength={44} required autoComplete="off" />
                </label>
                <label>
                  Team role
                  <select name="role">
                    <option value="member">Member</option>
                    {team.role === "owner" && <option value="admin">Admin</option>}
                  </select>
                </label>
              </FieldForm>
            </details>
          )}
          {invites.length > 0 && (
            <>
              <h3>Pending invitations</h3>
              <ul className={styles.list}>
                {invites.map((invite) => (
                  <li key={invite.wallet}>
                    <div>
                      <span title={invite.wallet}>{shorten(invite.wallet)}</span>
                      <p className="caption">
                        {roles[invite.role]} · Expires {formatDate.format(invite.expires)}
                      </p>
                    </div>
                    {(team.role === "owner" || invite.role === "member") && (
                      <button
                        className="button quiet"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run({
                            action: "cancel-invite",
                            team: id,
                            wallet: invite.wallet,
                          })
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
      {projectId && (
        <ProjectWorkspace key={projectId} id={projectId} revision={revision} pending={pending} run={run} />
      )}
    </>
  );
}

function SignedInTeams({ wallet }: { wallet: string }) {
  const [revision, setRevision] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const { data, error } = useTeamData<Overview>("teams", revision);
  const teamId = data?.teams.find(({ id }) => id === selectedTeam)?.id ?? data?.teams[0]?.id;
  const run: RunAction = <T,>(action: TeamAction, success?: (result: T) => void) => {
    if (pending) return;
    setPending(true);
    setFailure("");
    setNotice("");
    void request<T>("teams", action)
      .then((result) => {
        success?.(result);
        setRevision((current) => current + 1);
        setNotice("Changes saved.");
      })
      .catch((error: Error) => setFailure(error.message))
      .finally(() => setPending(false));
  };
  return (
    <div className={styles.stack}>
      {error && (
        <div className={styles.row}>
          <p role="alert">{error}</p>
          <button
            className="button quiet"
            type="button"
            onClick={() => setRevision((current) => current + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {!data && !error && <p role="status">Loading teams…</p>}
      <p role="status" aria-live="polite" className={notice ? "caption" : styles.hidden}>
        {notice}
      </p>
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      {data && (
        <>
          <Section title="Your teams">
            {teamId && (
              <label>
                Team
                <select value={teamId} onChange={(event) => setSelectedTeam(event.target.value)}>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} · {roles[team.role]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <details open={!teamId}>
              <summary>New team</summary>
              <FieldForm
                label="Create team"
                pending={pending}
                submit={(fields) =>
                  run<{ id: string }>(
                    {
                      action: "create",
                      name: field(fields, "name"),
                    },
                    ({ id }) => setSelectedTeam(id),
                  )
                }
              >
                <label>
                  Team name
                  <input name="name" maxLength={60} required />
                </label>
              </FieldForm>
            </details>
          </Section>
          {data.invitations.length > 0 && (
            <Section title="Team invitations">
              <ul className={styles.list}>
                {data.invitations.map((invite) => (
                  <li key={invite.team}>
                    <div>
                      <strong>{invite.teamName}</strong>
                      <p className="caption">
                        {roles[invite.role]} · Expires {formatDate.format(invite.expires)}
                      </p>
                    </div>
                    <div className={styles.row}>
                      <button
                        className="button accent"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            {
                              action: "respond",
                              team: invite.team,
                              accept: true,
                            },
                            () => setSelectedTeam(invite.team),
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
                          run({
                            action: "respond",
                            team: invite.team,
                            accept: false,
                          })
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
          {teamId && (
            <TeamWorkspace
              key={teamId}
              id={teamId}
              wallet={wallet}
              revision={revision}
              pending={pending}
              run={run}
            />
          )}
        </>
      )}
    </div>
  );
}

export function Teams({ wallet }: { wallet?: string }) {
  return (
    <>
      <WorkspaceHeading
        icon={UsersRound}
        title="Teams"
        description="Manage wallet access, project budgets, and scoped API keys."
      />
      {wallet ? (
        <SignedInTeams key={wallet} wallet={wallet} />
      ) : (
        <Section title="Wallet required">
          <p>Connect your Solana wallet to create a team or accept an invitation.</p>
        </Section>
      )}
    </>
  );
}
