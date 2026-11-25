// spec/app/teams.md, "Story: Form a team": teams, members and roles, invitations, and project budgets.
import { UsersRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Page } from "../../../../gen/app__nav.ts";
import type { Session } from "../../../../gen/app__session.ts";
import type { Project, Role, Team, Teams } from "../../../../gen/app__teams.ts";
import { Button, Card, CardTitle, Input, Label } from "@repo/ui";
import { useRemote } from "../../remote.ts";

const roles: Record<Role, string> = { Owner: "Owner", Admin: "Admin", Member: "Member" };
const usd = (micros: number) => "$" + (micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2 });
const date = (time: number) => new Date(time).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });
const shorten = (wallet: string) => (wallet.length > 12 ? wallet.slice(0, 4) + "…" + wallet.slice(-4) : wallet);
const sevenDays = 7 * 86_400_000;

/** Micro-USD from a USD field, within the project's $0.01–$100,000 budget rule. */
const budgetOf = (value: string) => {
  const dollars = Number(value);
  if (!Number.isFinite(dollars)) return 0;
  const micros = Math.round(dollars * 1_000_000);
  return micros >= 10_000 && micros <= 100_000_000_000 ? micros : -1;
};

export function render(page: Page): ReactNode {
  if (page.tag !== "Console" || page.section !== "Teams") return null;
  return <TeamsArea />;
}

function TeamsArea() {
  const session = useRemote<Session>("session");
  const teams = useRemote<Teams>("teams");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  const wallet = session.state?.tag === "SignedIn" ? session.state.wallet : undefined;
  const all = teams.state?.teams ?? [];
  const team = all.find(({ id }) => id === selectedTeam) ?? all[0];
  const myRole = wallet && team ? team.members.find((member) => member.wallet === wallet)?.role : undefined;
  const canManage = myRole !== undefined && myRole !== "Member";
  const invitations = wallet
    ? all.flatMap((t) => t.invites.filter((invite) => invite.wallet === wallet).map((invite) => ({ ...invite, teamName: t.name, teamId: t.id })))
    : [];

  async function run(event: object, message: string, done?: () => void) {
    setBusy(true);
    setFailure("");
    try {
      const ok = await teams.send(event);
      if (ok) {
        setNotice("Changes saved.");
        done?.();
      } else {
        setFailure(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    const id = crypto.randomUUID();
    await run({ type: "createTeam", id, name, actor: wallet, now: Date.now() }, "Could not create the team.", () => {
      setSelectedTeam(id);
      event.currentTarget.reset();
    });
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !team) return;
    const data = new FormData(event.currentTarget);
    const invitee = String(data.get("wallet") ?? "").trim();
    const role = String(data.get("role") ?? "Member");
    const now = Date.now();
    await run(
      { type: "invite", teamId: team.id, actor: wallet, wallet: invitee, role, expiresAt: now + sevenDays, now },
      "Could not send the invitation.",
      () => event.currentTarget.reset(),
    );
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !team) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const budget = budgetOf(String(data.get("budget") ?? ""));
    if (budget < 0) return setFailure("Budgets run between $0.01 and $100,000."), undefined;
    await run(
      { type: "createProject", teamId: team.id, projectId: crypto.randomUUID(), actor: wallet, name, budget },
      "Could not create the project.",
      () => event.currentTarget.reset(),
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <UsersRound size={21} className="text-muted-foreground" aria-hidden />
        <div>
          <h1 className="font-serif text-3xl">Teams</h1>
          <p className="text-sm text-muted-foreground">Manage wallet access, project budgets, and scoped API keys.</p>
        </div>
      </header>

      {(failure || teams.error) && (
        <p role="alert" className="text-sm text-destructive">
          {failure || teams.error}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {notice}
      </p>

      {!wallet ? (
        <Card aria-label="Wallet required">
          <CardTitle>Wallet required</CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect your Solana wallet to create a team or accept an invitation.
          </p>
        </Card>
      ) : (
        <>
          <Card aria-label="Your teams">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Your teams</CardTitle>
              {team && (
                <label className="flex items-center gap-2 text-sm">
                  Team
                  <select
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={team.id}
                    onChange={(event) => setSelectedTeam(event.target.value)}
                  >
                    {all.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} · {roles[entry.members.find((m) => m.wallet === wallet)?.role ?? "Member"]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <details open={!team}>
              <summary className="cursor-pointer text-sm text-muted-foreground">New team</summary>
              <form className="mt-3 flex items-end gap-2" onSubmit={(event) => void createTeam(event)}>
                <Label className="flex flex-1 flex-col gap-1 text-sm">
                  Team name
                  <Input name="name" maxLength={60} required />
                </Label>
                <Button type="submit" size="sm" loading={busy}>
                  Create team
                </Button>
              </form>
            </details>
          </Card>

          {invitations.length > 0 && (
            <Card aria-label="Team invitations">
              <CardTitle>Team invitations</CardTitle>
              <ul className="flex flex-col gap-3">
                {invitations.map((invite) => (
                  <li key={invite.teamId} className="flex items-center justify-between gap-3">
                    <div>
                      <strong className="text-sm">{invite.teamName}</strong>
                      <p className="text-xs text-muted-foreground">
                        {roles[invite.role]} · Expires {date(invite.expiresAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            { type: "respond", teamId: invite.teamId, actor: wallet, accept: true, now: Date.now() },
                            "Could not accept the invitation.",
                            () => setSelectedTeam(invite.teamId),
                          )
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            { type: "respond", teamId: invite.teamId, actor: wallet, accept: false, now: Date.now() },
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
            </Card>
          )}

          {team && (
            <TeamDetail
              team={team}
              wallet={wallet}
              myRole={myRole ?? "Member"}
              canManage={canManage}
              busy={busy}
              run={run}
              invite={(event) => void invite(event)}
              createProject={(event) => void createProject(event)}
            />
          )}
        </>
      )}
    </main>
  );
}

function TeamDetail({
  team,
  wallet,
  myRole,
  canManage,
  busy,
  run,
  invite,
  createProject,
}: {
  team: Team;
  wallet: string;
  myRole: Role;
  canManage: boolean;
  busy: boolean;
  run: (event: object, message: string, done?: () => void) => Promise<void>;
  invite: (event: FormEvent<HTMLFormElement>) => void;
  createProject: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <Card aria-label="Members">
        <CardTitle>Members</CardTitle>
        <ul className="flex flex-col gap-2">
          {team.members.map((member) => {
            const self = member.wallet === wallet;
            const removable =
              member.role !== "Owner" &&
              (self || myRole === "Owner" || (myRole === "Admin" && member.role === "Member"));
            return (
              <li key={member.wallet} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <code className="font-mono" title={member.wallet}>
                    {shorten(member.wallet)}
                  </code>
                  {self ? " (you)" : ""} · {roles[member.role]}
                </span>
                <span className="flex gap-2">
                  {myRole === "Owner" && member.role !== "Owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          {
                            type: "changeRole",
                            teamId: team.id,
                            actor: wallet,
                            wallet: member.wallet,
                            role: member.role === "Admin" ? "Member" : "Admin",
                          },
                          "Could not change the role.",
                        )
                      }
                    >
                      {member.role === "Admin" ? "Make member" : "Make admin"}
                    </Button>
                  )}
                  {removable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          { type: "removeMember", teamId: team.id, actor: wallet, wallet: member.wallet },
                          self ? "Could not leave the team." : "Could not remove the member.",
                        )
                      }
                    >
                      {self ? "Leave team" : "Remove"}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {canManage && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Invite a wallet</summary>
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={invite}>
              <Label className="flex flex-1 flex-col gap-1 text-sm">
                Wallet address
                <Input name="wallet" required minLength={32} />
              </Label>
              <Label className="flex flex-col gap-1 text-sm">
                Team role
                <select name="role" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
                  <option value="Member">Member</option>
                  {myRole === "Owner" && <option value="Admin">Admin</option>}
                </select>
              </Label>
              <Button type="submit" size="sm" loading={busy}>
                Invite
              </Button>
            </form>
          </details>
        )}
        {team.invites.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {team.invites.map((invite) => (
              <li key={invite.wallet} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <code className="font-mono" title={invite.wallet}>
                    {shorten(invite.wallet)}
                  </code>{" "}
                  · {roles[invite.role]} · Expires {date(invite.expiresAt)}
                </span>
                {(myRole === "Owner" || invite.role === "Member") && canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        { type: "cancelInvite", teamId: team.id, actor: wallet, wallet: invite.wallet },
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
        )}
      </Card>

      <Card aria-label="Projects">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Projects</CardTitle>
        </div>
        {!team.projects.length ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {team.projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                canManage={canManage}
                busy={busy}
                run={run}
                wallet={wallet}
              />
            ))}
          </ul>
        )}
        {canManage && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">New project</summary>
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={createProject}>
              <Label className="flex flex-1 flex-col gap-1 text-sm">
                Name
                <Input name="name" maxLength={60} required />
              </Label>
              <BudgetField />
              <Button type="submit" size="sm" loading={busy}>
                Create project
              </Button>
            </form>
          </details>
        )}
      </Card>
    </>
  );
}

function BudgetField({ project }: { project?: Project }) {
  return (
    <Label className="flex flex-col gap-1 text-sm">
      Lifetime budget in USD
      <Input
        name="budget"
        type="number"
        min="0.01"
        max="100000"
        step="0.01"
        required
        defaultValue={project ? project.budget / 1_000_000 : ""}
      />
    </Label>
  );
}

function ProjectRow({
  project,
  canManage,
  busy,
  run,
  wallet,
}: {
  project: Project;
  canManage: boolean;
  busy: boolean;
  run: (event: object, message: string, done?: () => void) => Promise<void>;
  wallet: string;
}) {
  const [failure, setFailure] = useState("");
  const editable = canManage && !project.archived;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim() || project.name;
    const budget = budgetOf(String(data.get("budget") ?? ""));
    if (budget < 0) return setFailure("Budgets run between $0.01 and $100,000."), undefined;
    await run(
      { type: "updateProject", projectId: project.id, actor: wallet, name, budget },
      "Could not save the project.",
    );
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">
          {project.name}
          {project.archived && (
            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">Archived</span>
          )}
        </strong>
        {canManage && !project.archived && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run({ type: "archiveProject", projectId: project.id, actor: wallet }, "Could not archive the project.")
            }
          >
            Archive project
          </Button>
        )}
      </div>
      <dl className="flex gap-6 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Budget</dt>
          <dd>{usd(project.budget)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Spent</dt>
          <dd>{usd(project.spent)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Budget remaining</dt>
          <dd>{usd(Math.max(project.budget - project.spent, 0))}</dd>
        </div>
      </dl>
      {editable && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void save(event)}>
          <Label className="flex flex-1 flex-col gap-1 text-sm">
            Name
            <Input name="name" maxLength={60} defaultValue={project.name} required />
          </Label>
          <BudgetField project={project} />
          <Button type="submit" variant="secondary" size="sm" loading={busy}>
            Save project
          </Button>
        </form>
      )}
      {failure && (
        <p role="alert" className="text-xs text-destructive">
          {failure}
        </p>
      )}
    </li>
  );
}
