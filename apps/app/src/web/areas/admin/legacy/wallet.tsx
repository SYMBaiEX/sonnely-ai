// @ts-nocheck — compatibility adapter from the legacy Convex admin API to the vibestack machines.
export type Session = {
  profile: {
    wallet: string;
    name: string;
    username?: string;
    balance: number;
    referral: string;
    role?: "admin" | "support" | "finance" | "member";
    onboarding?: "pending" | "fund" | "later";
  } | null;
  enabled: boolean;
  termsRequired?: boolean;
  billingEnabled: boolean;
  paymentVerificationEnabled: boolean;
  inferenceEnabled: boolean;
  cluster: string;
};

const pageSize = 25;
const emptyCrm = () => ({ profiles: [], activities: [], tasks: [], flags: [], segments: [], adjustments: [] });

function crmOf(states: Record<string, any>) {
  return { ...emptyCrm(), ...(states["admin-crm"] ?? {}) };
}

function operatorWallet(states: Record<string, any>) {
  return states.session?.tag === "SignedIn" ? states.session.wallet : states.admin?.ops?.roster?.[0]?.wallet ?? "operator";
}

async function actingOperator() {
  const session = await readMachine("session");
  return session?.tag === "SignedIn" ? session.wallet : "operator";
}

function taskRow(task: any, customers: any[]) {
  const customer = customers.find((row) => row.id === task.account);
  return { ...task, dueAt: task.dueAt || undefined, doneAt: task.doneAt || undefined, wallet: task.account, name: customer?.name ?? "" };
}

function customerBalance(states: Record<string, any>, wallet: string) {
  return (states["billing-ledger"]?.entries ?? []).reduce((sum: number, entry: any) => sum + (entry.wallet === wallet ? (entry.kind === "Charge" || entry.kind === "AdjustDebit" ? -entry.amount : entry.amount) : 0), 0);
}

async function readMachine(name: string) {
  const path = name === "session" ? "/api/session" : "/api/machines/" + name;
  const response = await fetch(path, { cache: "no-store" });
  return response.ok ? await response.json() : undefined;
}

async function readMachines() {
  const names = ["session", "admin", "admin-crm", "usage", "support", "workspace-keys", "billing-ledger", "billing-deposits", "teams", "console", "console__logs"];
  const entries = await Promise.all(names.map(async (name) => [name, await readMachine(name)]));
  return Object.fromEntries(entries) as Record<string, any>;
}

async function postMachine(name: string, event: unknown) {
  const response = await fetch("/api/machines/" + name, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error ?? "The machine refused the event.");
  return body.state;
}

async function postAdmin(event: Record<string, unknown>) {
  const session = await readMachine("session");
  const wallet = session?.tag === "SignedIn" ? session.wallet : "";
  return postMachine("admin", { ...event, by: wallet });
}

function cursorPage(rows: any[], cursor?: string) {
  const start = cursor ? Math.max(0, rows.findIndex((row) => row.id === cursor) + 1) : 0;
  const page = rows.slice(start, start + pageSize);
  return { page, isDone: start + pageSize >= rows.length, continueCursor: page.at(-1)?.id ?? "" };
}

const lowerTicketState = (state: string) => (state === "InProgress" ? "in_progress" : state.toLowerCase());
const upperTicketState = (state: string) => (state === "in_progress" ? "InProgress" : state === "resolved" ? "Resolved" : "Open");
const lowerStatus = (status: string) => status.toLowerCase();
const providerId = (provider: string) => (provider === "NearAI" ? "near-ai" : provider.toLowerCase());

function ticketRow(ticket: any, account?: string) {
  return {
    id: ticket.id,
    account: account ?? ticket.wallet ?? "",
    email: ticket.email,
    topic: ticket.topic,
    message: ticket.message,
    state: lowerTicketState(ticket.state),
    opened: ticket.openedAt,
    updated: ticket.updatedAt,
    replyCount: ticket.replies.length,
    assignedWallet: ticket.assignedTo || undefined,
  };
}

function supportRows(support: any) {
  return (support?.tickets ?? []).map((ticket: any) => ticketRow(ticket));
}

function thread(ticket: any, customers: any[]) {
  if (!ticket) return null;
  const row = ticketRow(ticket);
  const customer = customers.find((item) => item.id === row.account) ?? { id: row.account, wallet: "", name: "", username: "" };
  return {
    ...row,
    customer,
    replies: ticket.replies.map((reply: any, index: number) => ({
      id: ticket.id + "-reply-" + index,
      author: reply.author === "Staff" ? reply.authorWallet || "Unavailable" : reply.author,
      visibility: reply.visibility.toLowerCase(),
      body: reply.body,
      time: reply.time,
    })),
  };
}

function traceRow(row: any, account: string) {
  return {
    id: row.id,
    account,
    wallet: account,
    started: row.time,
    settled: row.status === "Pending" ? undefined : row.time + Math.max(0, row.providerMs),
    keyName: row.keyName,
    model: row.model,
    provider: providerId(row.provider),
    status: lowerStatus(row.status),
    input: row.input,
    output: row.output,
    cached: row.cached,
    cost: row.cost,
    providerMs: row.providerMs < 0 ? undefined : row.providerMs,
    providerRequest: undefined,
    outcome: row.status === "Complete" ? "complete" : undefined,
  };
}

function customersFrom(states: Record<string, any>) {
  const admin = states.admin;
  const crm = crmOf(states);
  const records = [...(admin?.records ?? [])];
  const wallet = states.session?.tag === "SignedIn" ? states.session.wallet : undefined;
  if (wallet && !records.some((row) => row.id === wallet)) {
    records.push({ id: wallet, subject: "User", status: "Active", usage: 0 });
  }
  for (const profile of crm.profiles) {
    if (!records.some((row) => row.id === profile.wallet)) records.push({ id: profile.wallet, subject: "User", status: "Active", usage: 0 });
  }
  return records.map((record: any, index: number) => {
    const profile = crm.profiles.find((row) => row.wallet === record.id);
    const usageRows = (states.usage?.rows ?? []).filter((row: any) => index === 0 || row.keyId === record.id);
    const balance = customerBalance(states, record.id);
    const flags = new Set(crm.flags.filter((row) => row.account === record.id).map((row) => row.flag));
    if (record.status === "Suspended") flags.add("suspended");
    if (balance > 0) flags.add("funded");
    return {
      id: record.id,
      wallet: record.id,
      name: profile?.name || (index === 0 && states.console?.name ? states.console.name : ""),
      username: profile?.username || (index === 0 && states.console?.username ? states.console.username : ""),
      joined: profile?.joined || Date.now() - (index + 4) * 86_400_000,
      balance,
      role: record.subject === "Org" ? "organization" : "owner",
      funded: balance > 0,
      active: usageRows.some((row: any) => row.status === "Complete"),
      flags: [...flags],
      usage: record.usage,
      status: record.status,
    };
  });
}

function customerDetail(id: string, states: Record<string, any>) {
  const customers = customersFrom(states);
  const customer = customers.find((row) => row.id === id);
  if (!customer) return null;
  const crm = crmOf(states);
  const profile = crm.profiles.find((row) => row.wallet === id);
  const traces = (states.usage?.rows ?? []).map((row: any) => traceRow(row, id));
  const tickets = supportRows(states.support).filter((row: any) => row.account === id);
  const keys = (states["workspace-keys"]?.keys ?? []).map((key: any) => ({
    id: key.id,
    name: key.label,
    prefix: key.prefix,
    lastUsed: key.lastUsedAt || undefined,
    revoked: key.status === "Revoked",
  }));
  const deposits = (states["billing-deposits"]?.intents ?? []).filter((item: any) => item.wallet === id).map((item: any) => ({
    id: item.reference,
    reference: item.reference,
    time: item.createdAt,
    cluster: "mainnet",
    amount: item.amount,
    signature: item.status?.tag === "Finalized" ? item.status.signature : undefined,
  }));
  const activity = crm.activities.filter((row) => row.account === id).sort((a, b) => b.time - a.time);
  const tasks = crm.tasks.filter((task) => task.account === id).map((task) => taskRow(task, customers));
  const audit = (states.admin?.audit ?? []).filter((entry: any) => entry.target === id);
  const inviterRow = profile?.inviter ? customers.find((row) => row.id === profile.inviter) : undefined;
  const inviter = profile?.inviter ? inviterRow ?? { id: profile.inviter, wallet: profile.inviter, name: "", username: undefined, joined: 0, balance: 0, role: "owner", funded: false, active: false, flags: [] } : undefined;
  return {
    customer: { ...customer, onboarding: profile?.onboarding || undefined },
    suspended: customer.status === "Suspended",
    flags: customer.flags,
    active: customer.active,
    funded: customer.funded,
    acceptedTerms: profile?.termsVersion || undefined,
    acceptedAt: profile?.termsAcceptedAt || undefined,
    inviter,
    stats: {
      totalSpend: traces.reduce((sum: number, row: any) => sum + row.cost, 0),
      totalDeposits: deposits.reduce((sum: number, row: any) => sum + row.amount, 0),
      requestCount: traces.length,
      lastActiveAt: traces.at(-1)?.started,
      referredCount: 0,
    },
    keys,
    deposits,
    adjustments: crm.adjustments.filter((row) => row.account === id).map((row) => ({ ...row, adminWallet: row.admin })).sort((a, b) => b.time - a.time),
    tickets,
    traces,
    referrals: [],
    tasks,
    activity,
    timeline: [
      ...audit.map((entry: any) => ({ id: "audit-" + entry.at + entry.act, kind: entry.act, summary: entry.summary, actor: entry.actor, time: entry.at })),
      ...activity.map((row: any) => ({ ...row, summary: row.note })),
    ].sort((a, b) => b.time - a.time),
  };
}

function overview(states: Record<string, any>) {
  const usage = states.usage?.rows ?? [];
  const complete = usage.filter((row: any) => row.status === "Complete");
  const failed = usage.filter((row: any) => row.status === "Failed");
  const held = usage.filter((row: any) => row.status === "Pending" || row.status === "Unreported");
  const deposits = (states["billing-deposits"]?.intents ?? []).filter((row: any) => row.status?.tag === "Finalized");
  const spend = complete.reduce((sum: number, row: any) => sum + row.cost, 0);
  const models: Record<string, any> = {};
  for (const row of usage) {
    const metric = (models[row.model] ??= { requests: 0, complete: 0, failed: 0, held: 0, spendMicros: 0 });
    metric.requests += 1;
    if (row.status === "Complete") metric.complete += 1;
    if (row.status === "Failed") metric.failed += 1;
    if (row.status === "Pending" || row.status === "Unreported") metric.held += 1;
    metric.spendMicros += row.cost;
  }
  return {
    stats: {
      requests: usage.length,
      complete: complete.length,
      failed: failed.length,
      held: held.length,
      input: usage.reduce((sum: number, row: any) => sum + Math.max(0, row.input), 0),
      output: usage.reduce((sum: number, row: any) => sum + Math.max(0, row.output), 0),
      spendMicros: spend,
    },
    deposits: deposits.length,
    depositMicros: deposits.reduce((sum: number, row: any) => sum + row.amount, 0),
    activeWallets: customersFrom(states).filter((row) => row.active).length,
    tickets: states.support?.tickets?.length ?? 0,
    activation: { joined: customersFrom(states).length, accepted: customersFrom(states).length, finishedSetup: customersFrom(states).length, startedFunding: deposits.length, funded: customersFrom(states).filter((row) => row.funded).length, active: customersFrom(states).filter((row) => row.active).length, capped: false },
    creditRecovery: { held: held.map((row: any) => ({ id: row.id, wallet: row.keyId || row.keyName, model: row.model, created: row.time, cost: row.cost, status: lowerStatus(row.status), providerRequest: undefined })), recent: [] },
    creditLiability: states["billing-ledger"]?.balance ?? 0,
    treasuryMicros: null,
    gateway: { state: "unavailable" },
    payouts: [],
    finance: { reconciled: complete.length, customerMicros: spend, providerNano: 0, availableMicros: 0, paidMicros: 0 },
    models,
    truncated: false,
    hasUnreconciled: false,
  };
}

async function crmRead(task: string) {
  const states = await readMachines();
  const [path, query = ""] = task.split("?");
  const params = new URLSearchParams(query);
  const view = params.get("view") ?? "customers";
  const customers = customersFrom(states);
  if (view === "nav-badges") {
    const openTickets = (states.support?.tickets ?? []).filter((row: any) => row.state !== "Resolved").length;
    const now = Date.now();
    return { openTickets, overdueTasks: crmOf(states).tasks.filter((row) => row.doneAt === 0 && row.dueAt !== 0 && row.dueAt < now).length };
  }
  if (view === "tasks") return crmOf(states).tasks.filter((row) => row.doneAt === 0 && row.assignee === operatorWallet(states)).map((row) => taskRow(row, customers));
  if (view === "segments") return crmOf(states).segments.filter((row) => row.admin === operatorWallet(states));
  if (view === "flags") return [...new Set(customers.flatMap((row) => row.flags))].sort();
  if (view === "operators" || view === "operator-list") {
    return (states.admin?.ops?.roster ?? []).map((row: any) => ({
      id: row.wallet,
      wallet: row.wallet,
      name: "",
      role: row.role.toLowerCase(),
      lastActiveAt: undefined,
      openTickets: (states.support?.tickets ?? []).filter((ticket) => ticket.assignedTo === row.wallet && ticket.state !== "Resolved").length,
      openTasks: crmOf(states).tasks.filter((task) => task.assignee === row.wallet && task.doneAt === 0).length,
    }));
  }
  if (view === "customer-flags") return customers.find((row) => row.id === params.get("id"))?.flags ?? [];
  if (view === "customer") return customerDetail(String(params.get("id") ?? ""), states);
  if (view === "support-thread") return thread((states.support?.tickets ?? []).find((row: any) => row.id === params.get("id")), customers);
  if (view === "analytics") {
    const rows = states.usage?.rows ?? [];
    const days = Number(params.get("days") ?? 30);
    const daily = Array.from({ length: days }, (_, index) => {
      const day = new Date(Date.now() - (days - index - 1) * 86_400_000).toISOString().slice(0, 10);
      const dayRows = rows.filter((row: any) => new Date(row.time).toISOString().slice(0, 10) === day);
      return { day, requests: dayRows.length, input: dayRows.reduce((n: number, row: any) => n + Math.max(0, row.input), 0), output: dayRows.reduce((n: number, row: any) => n + Math.max(0, row.output), 0), spendMicros: dayRows.reduce((n: number, row: any) => n + row.cost, 0) };
    });
    return {
      days: daily.map((row) => {
        const dayRows = rows.filter((item) => new Date(item.time).toISOString().slice(0, 10) === row.day);
        return {
          day: row.day,
          requests: row.requests,
          completed: dayRows.filter((item) => item.status === "Complete").length,
          spend: row.spendMicros,
          signups: customers.filter((item) => new Date(item.joined).toISOString().slice(0, 10) === row.day).length,
          deposits: (states["billing-deposits"]?.intents ?? []).filter((item) => new Date(item.createdAt).toISOString().slice(0, 10) === row.day).length,
          depositUsd: (states["billing-deposits"]?.intents ?? []).filter((item) => new Date(item.createdAt).toISOString().slice(0, 10) === row.day).reduce((sum, item) => sum + item.amount, 0),
        };
      }),
      topModels: Object.entries(rows.reduce((groups, row) => {
        const group = (groups[row.model] ??= { model: row.model, requests: 0, spend: 0 });
        group.requests += 1;
        group.spend += row.cost;
        return groups;
      }, {})).map(([, row]) => row).sort((a, b) => b.spend - a.spend).slice(0, 8),
      topCustomers: Object.entries(rows.reduce((groups, row) => {
        const id = row.keyId || row.keyName || "";
        if (!id) return groups;
        const group = (groups[id] ??= { id, requests: 0, spend: 0 });
        group.requests += 1;
        group.spend += row.cost;
        return groups;
      }, {})).map(([, group]) => {
        const customer = customers.find((item) => item.id === group.id);
        return { id: group.id, wallet: customer?.wallet ?? group.id, name: customer?.name ?? "", username: customer?.username ?? "", spend: group.spend, requests: group.requests };
      }).filter((row) => row.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 8),
      providerSplit: Object.entries(rows.reduce((groups, row) => {
        const provider = providerId(row.provider);
        groups[provider] = (groups[provider] ?? 0) + 1;
        return groups;
      }, {})).map(([provider, requests]) => ({ provider, requests })).sort((a, b) => b.requests - a.requests),
      truncated: false,
    };
  }
  if (view === "audit") {
    const rows = (states.admin?.audit ?? []).map((entry: any) => ({ id: entry.at + entry.act + entry.target, time: entry.at, actor: entry.actor, action: entry.act, targetKind: "account", targetId: entry.target, summary: entry.summary, meta: undefined })).reverse();
    return cursorPage(rows.filter((row) => (!params.get("action") || row.action === params.get("action")) && (!params.get("actor") || row.actor.includes(String(params.get("actor")))) && row.time >= Number(params.get("since") ?? 0)), params.get("cursor") ?? undefined);
  }
  if (view === "support") {
    const search = String(params.get("search") ?? "").toLowerCase();
    const filter = params.get("filter") ?? "all";
    const stateRank = { open: 0, in_progress: 1, resolved: 2 };
    const triage = (a, b) => {
      const state = (stateRank[a.state] ?? 0) - (stateRank[b.state] ?? 0);
      if (state) return state;
      if (a.state === "resolved") return b.updated - a.updated;
      const ownership = (a.assignedWallet ? 1 : 0) - (b.assignedWallet ? 1 : 0);
      if (ownership) return ownership;
      return a.updated - b.updated;
    };
    const rows = supportRows(states.support).filter((row) => (filter === "all" || row.state === filter) && (!search || (row.topic + row.email + row.message).toLowerCase().includes(search))).sort(triage);
    return cursorPage(rows, params.get("cursor") ?? undefined);
  }
  if (view === "traces") {
    const search = String(params.get("search") ?? "").toLowerCase();
    const filter = params.get("filter") ?? "all";
    const since = Number(params.get("since") ?? 0);
    const rows = (states.usage?.rows ?? []).map((row: any) => traceRow(row, customers[0]?.id ?? "")).filter((row) => row.started >= since && (filter === "all" || row.status === filter) && (!params.get("model") || row.model === params.get("model")) && (!params.get("provider") || row.provider === params.get("provider")) && (!search || row.id.toLowerCase().includes(search))).sort((a, b) => b.started - a.started);
    return cursorPage(rows, params.get("cursor") ?? undefined);
  }
  const search = String(params.get("search") ?? "").replace(/^@/, "").toLowerCase();
  let rows = customers.filter((row) => (!search || row.wallet.toLowerCase().includes(search) || row.name.toLowerCase().includes(search) || row.username.toLowerCase().includes(search)) && (!params.get("flag") || row.flags.includes(String(params.get("flag")))) && (!params.get("funded") || (params.get("funded") === "funded") === row.funded) && (!params.get("active") || row.active));
  if (params.get("sort") === "spend") rows = rows.sort((a, b) => b.usage - a.usage);
  else if (params.get("sort") === "balance") rows = rows.sort((a, b) => b.balance - a.balance);
  else rows = rows.sort((a, b) => b.joined - a.joined);
  return cursorPage(rows, params.get("cursor") ?? undefined);
}

export async function request<T>(task: string, data?: unknown): Promise<T> {
  if (task.startsWith("admin-crm")) return (await crmRead(task)) as T;
  const body = (data ?? {}) as any;
  if (task === "admin") return (await overview(await readMachines())) as T;
  if (task === "admin-invoices") return [] as T;
  if (task.startsWith("admin-gateway")) {
    if (new URLSearchParams(task.split("?")[1]).get("requestId")) throw new Error("UsageMax reporting is not configured in the vibestack staging shell.");
    const now = Date.now();
    return {
      operations: null,
      delivery: { queued: 0, failed: 0, oldestQueuedAt: null, truncated: false },
      invoices: [],
      automation: {
        status: "unavailable",
        emailEnabled: false,
        fallbackConfigured: false,
        checks: [],
        email: [],
        generatedAt: now,
      },
    } as T;
  }
  if (task === "confidential-payments/review" || task.startsWith("confidential-payments/review?")) return { payments: [], nextCursor: null } as T;
  if (task === "admin-privacy-rings") return { cluster: "mainnet", treasury: "11111111111111111111111111111111", registered: false, canPrepare: false } as T;
  if (task === "admin-alert-email-test") return { ok: true } as T;
  if (task === "admin-reconcile") return { count: 0 } as T;
  if (task === "admin-open-payout") throw new Error("Treasury payouts are not modeled by the vibestack admin machine.");
  if (task === "admin-confirm-payout") return { ok: false } as T;
  if (task === "admin-invoice-preview" || task === "admin-invoice-record") return [] as T;
  if (task === "admin-suspend") return (await postAdmin({ type: body.suspended ? "suspend" : "reinstate", id: body.account, at: Date.now() })) as T;
  if (task === "admin-revoke-key") return (await postMachine("workspace-keys", { type: "revoke", id: body.id })) as T;
  if (task === "admin-reply") {
    const author = await actingOperator();
    return (await postMachine("support", { type: "staffReply", id: body.id, body: String(body.body ?? ""), visibility: body.visibility === "internal" ? "Internal" : "Public", author, now: Date.now() })) as T;
  }
  if (task === "admin-ticket") {
    const now = Date.now();
    if (body.assignment && body.assignment !== "keep") {
      const operator = await actingOperator();
      const wallet = body.assignment === "unassign" ? "" : body.assignment === "assign" ? String(body.assignTo ?? "") : operator;
      await postMachine("support", { type: "assignOwner", id: body.id, wallet, now });
    }
    return (await postMachine("support", { type: "setState", id: body.id, status: upperTicketState(String(body.state ?? "open")), now })) as T;
  }
  if (task === "admin-ticket-bulk") {
    let applied = 0;
    const operator = await actingOperator();
    for (const id of body.ids ?? []) {
      const now = Date.now();
      if (body.op === "resolve") await postMachine("support", { type: "setState", id, status: "Resolved", now });
      if (body.op === "unassign") await postMachine("support", { type: "assignOwner", id, wallet: "", now });
      if (body.op === "claim") await postMachine("support", { type: "assignOwner", id, wallet: operator, now });
      applied += 1;
    }
    return { applied, skipped: 0 } as T;
  }
  if (task === "admin-note") {
    const actor = await actingOperator();
    await postMachine("admin-crm", { type: "addNote", id: crypto.randomUUID(), account: body.account, actor, note: String(body.note ?? ""), now: Date.now() });
    return { ok: true } as T;
  }
  if (task === "admin-task-create") {
    const creator = await actingOperator();
    const title = String(body.title ?? "");
    await postMachine("admin-crm", { type: "createTask", id: crypto.randomUUID(), activityId: crypto.randomUUID(), account: body.account, assignee: creator, creator, title, dueAt: body.dueAt ?? 0, summary: "Follow-up created: " + title, now: Date.now() });
    return { ok: true } as T;
  }
  if (task === "admin-task-done" || task === "admin-task-reopen") {
    await postMachine("admin-crm", task === "admin-task-done" ? { type: "completeTask", id: body.id, now: Date.now() } : { type: "reopenTask", id: body.id });
    return { ok: true } as T;
  }
  if (task === "admin-flag" || task === "admin-unflag") {
    const admin = await actingOperator();
    const flag = String(body.flag ?? "");
    const event = task === "admin-flag"
      ? { type: "setFlag", activityId: crypto.randomUUID(), account: body.account, flag, note: "", admin, summary: "Flag '" + flag + "' added", now: Date.now() }
      : { type: "removeFlag", activityId: crypto.randomUUID(), account: body.account, flag, admin, summary: "Flag '" + flag + "' removed", now: Date.now() };
    await postMachine("admin-crm", event);
    return { ok: true } as T;
  }
  if (task === "admin-segment-save") {
    const admin = await actingOperator();
    const segment = { id: crypto.randomUUID(), name: String(body.name ?? ""), definition: String(body.definition ?? "{}") };
    await postMachine("admin-crm", { type: "saveSegment", ...segment, admin, now: Date.now() });
    return segment as T;
  }
  if (task === "admin-segment-delete") {
    await postMachine("admin-crm", { type: "deleteSegment", id: body.id, admin: await actingOperator() });
    return { ok: true } as T;
  }
  if (task === "admin-adjust-balance") {
    const response = await fetch("/api/admin/adjust", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), activityId: crypto.randomUUID(), account: body.account, delta: Number(body.delta), reason: String(body.reason ?? "") }),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok || answer.ok === false) throw new Error(answer.error ?? "The adjustment was refused.");
    return { ok: true } as T;
  }
  if (task === "admin-reset-sessions" || task === "admin-resolve-credit") return { ok: true } as T;
  if (task.startsWith("confidential-payments/")) throw new Error("Confidential payment review is not modeled by the vibestack admin machine.");
  throw new Error("The vibestack staging shell does not implement " + task + " yet.");
}

export async function payWithWallet(): Promise<string> {
  throw new Error("Treasury payout transactions are not modeled by the vibestack admin machine.");
}
