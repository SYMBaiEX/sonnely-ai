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
const overlayKey = "sonnely.admin.crm-overlay";

type Overlay = {
  flags: Record<string, string[]>;
  notes: Record<string, any[]>;
  tasks: any[];
  segments: any[];
  assignments: Record<string, string>;
  adjustments: Record<string, any[]>;
};

const emptyOverlay = (): Overlay => ({ flags: {}, notes: {}, tasks: [], segments: [], assignments: {}, adjustments: {} });

function overlay(): Overlay {
  try {
    return { ...emptyOverlay(), ...JSON.parse(localStorage.getItem(overlayKey) ?? "{}") };
  } catch {
    return emptyOverlay();
  }
}

function keepOverlay(next: Overlay) {
  localStorage.setItem(overlayKey, JSON.stringify(next));
}

function mutateOverlay(change: (draft: Overlay) => void) {
  const draft = overlay();
  change(draft);
  keepOverlay(draft);
}

async function readMachine(name: string) {
  const response = await fetch("/api/machines/" + name, { cache: "no-store" });
  return response.ok ? await response.json() : undefined;
}

async function readMachines() {
  const names = ["session", "admin", "usage", "support", "workspace-keys", "billing-ledger", "billing-deposits", "teams", "console", "console__logs"];
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

function ticketRow(ticket: any, account = "") {
  const o = overlay();
  return {
    id: ticket.id,
    account,
    email: ticket.email,
    topic: ticket.topic,
    message: ticket.message,
    state: lowerTicketState(ticket.state),
    opened: ticket.openedAt,
    updated: ticket.updatedAt,
    replyCount: ticket.replies.length,
    assignedWallet: o.assignments[ticket.id],
  };
}

function supportRows(support: any, customers: any[]) {
  return (support?.tickets ?? []).map((ticket: any) => ticketRow(ticket, customers[0]?.id ?? ""));
}

function thread(ticket: any, customers: any[]) {
  if (!ticket) return null;
  const row = ticketRow(ticket, customers[0]?.id ?? "");
  const customer = customers.find((item) => item.id === row.account) ?? { id: row.account, wallet: "", name: "", username: "" };
  return {
    ...row,
    customer,
    replies: ticket.replies.map((reply: any, index: number) => ({
      id: ticket.id + "-reply-" + index,
      author: reply.author === "Staff" ? "Unavailable" : reply.author,
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
  const ledger = states["billing-ledger"];
  const o = overlay();
  const records = [...(admin?.records ?? [])];
  const wallet = states.session?.tag === "SignedIn" ? states.session.wallet : undefined;
  if (wallet && !records.some((row) => row.id === wallet)) {
    records.push({ id: wallet, subject: "User", status: "Active", usage: 0 });
  }
  return records.map((record: any, index: number) => {
    const usageRows = (states.usage?.rows ?? []).filter((row: any) => index === 0 || row.keyId === record.id);
    const balance = (ledger?.entries ?? []).reduce((sum: number, entry: any) => sum + (entry.wallet === record.id ? (entry.kind === "Charge" ? -entry.amount : entry.amount) : 0), 0);
    const flags = new Set(o.flags[record.id] ?? []);
    if (record.status === "Suspended") flags.add("suspended");
    if (balance > 0) flags.add("funded");
    return {
      id: record.id,
      wallet: record.id,
      name: index === 0 && states.console?.name ? states.console.name : "",
      username: index === 0 && states.console?.username ? states.console.username : "",
      joined: Date.now() - (index + 4) * 86_400_000,
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
  const o = overlay();
  const traces = (states.usage?.rows ?? []).map((row: any) => traceRow(row, id));
  const tickets = supportRows(states.support, customers);
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
  const notes = o.notes[id] ?? [];
  const tasks = o.tasks.filter((task) => task.account === id);
  const audit = (states.admin?.audit ?? []).filter((entry: any) => entry.target === id);
  return {
    customer: { ...customer, onboarding: undefined },
    suspended: customer.status === "Suspended",
    flags: customer.flags,
    active: customer.active,
    funded: customer.funded,
    acceptedTerms: undefined,
    acceptedAt: undefined,
    inviter: undefined,
    stats: {
      totalSpend: traces.reduce((sum: number, row: any) => sum + row.cost, 0),
      totalDeposits: deposits.reduce((sum: number, row: any) => sum + row.amount, 0),
      requestCount: traces.length,
      lastActiveAt: traces.at(-1)?.started,
      referredCount: 0,
    },
    keys,
    deposits,
    adjustments: o.adjustments[id] ?? [],
    tickets,
    traces,
    referrals: [],
    tasks,
    activity: notes,
    timeline: [
      ...audit.map((entry: any) => ({ id: "audit-" + entry.at + entry.act, kind: entry.act, summary: entry.summary, actor: entry.actor, time: entry.at })),
      ...notes.map((note: any) => ({ ...note, kind: "note", summary: note.note })),
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
    compute: null,
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
    return { openTickets, overdueTasks: overlay().tasks.filter((row) => row.doneAt === undefined && row.dueAt !== undefined && row.dueAt < now).length };
  }
  if (view === "tasks") return overlay().tasks.filter((row) => row.doneAt === undefined);
  if (view === "segments") return overlay().segments;
  if (view === "flags") return [...new Set(customers.flatMap((row) => row.flags))].sort();
  if (view === "operators" || view === "operator-list") {
    return (states.admin?.ops?.roster ?? []).map((row: any) => ({
      id: row.wallet,
      wallet: row.wallet,
      name: "",
      role: row.role.toLowerCase(),
      lastActiveAt: undefined,
      openTickets: 0,
      openTasks: overlay().tasks.filter((task) => task.assignee === row.wallet && task.doneAt === undefined).length,
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
      topCustomers: [],
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
    const rows = supportRows(states.support, customers).filter((row) => (filter === "all" || row.state === filter) && (!search || (row.topic + row.email + row.message).toLowerCase().includes(search))).sort((a, b) => b.updated - a.updated);
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
  if (task === "compute?admin=capacity") return { state: "unavailable", enabled: false, active: null, limit: null } as T;
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
  if (task === "admin-reply") return (await postMachine("support", { type: "staffReply", id: body.id, body: String(body.body ?? ""), visibility: body.visibility === "internal" ? "Internal" : "Public", now: Date.now() })) as T;
  if (task === "admin-ticket") {
    if (body.assignment && body.assignment !== "keep") {
      const states = await readMachines();
      const operator = states.admin?.ops?.roster?.[0]?.wallet ?? "";
      mutateOverlay((draft) => {
        if (body.assignment === "unassign") delete draft.assignments[body.id];
        else if (body.assignment === "claim") draft.assignments[body.id] = operator;
        else draft.assignments[body.id] = body.assignment === "assign" ? body.assignTo : operator;
      });
    }
    return (await postMachine("support", { type: "setState", id: body.id, status: upperTicketState(String(body.state ?? "open")), now: Date.now() })) as T;
  }
  if (task === "admin-ticket-bulk") {
    let applied = 0;
    for (const id of body.ids ?? []) {
      if (body.op === "resolve") await postMachine("support", { type: "setState", id, status: "Resolved", now: Date.now() });
      if (body.op !== "resolve") mutateOverlay((draft) => {
        if (body.op === "unassign") delete draft.assignments[id];
        if (body.op === "claim") draft.assignments[id] = "operator";
      });
      applied += 1;
    }
    return { applied, skipped: 0 } as T;
  }
  if (task === "admin-note") {
    mutateOverlay((draft) => {
      const note = { id: crypto.randomUUID(), note: String(body.note ?? ""), actor: "operator", time: Date.now() };
      (draft.notes[body.account] ??= []).unshift(note);
    });
    return { ok: true } as T;
  }
  if (task === "admin-task-create") {
    mutateOverlay((draft) => draft.tasks.push({ id: crypto.randomUUID(), account: body.account, title: String(body.title ?? ""), dueAt: body.dueAt, assignee: "operator", wallet: body.account, name: "" }));
    return { ok: true } as T;
  }
  if (task === "admin-task-done" || task === "admin-task-reopen") {
    mutateOverlay((draft) => {
      const row = draft.tasks.find((taskRow) => taskRow.id === body.id);
      if (row) row.doneAt = task === "admin-task-done" ? Date.now() : undefined;
    });
    return { ok: true } as T;
  }
  if (task === "admin-flag" || task === "admin-unflag") {
    mutateOverlay((draft) => {
      const flags = new Set(draft.flags[body.account] ?? []);
      if (task === "admin-flag") flags.add(String(body.flag)); else flags.delete(String(body.flag));
      draft.flags[body.account] = [...flags];
    });
    return { ok: true } as T;
  }
  if (task === "admin-segment-save") {
    const segment = { id: crypto.randomUUID(), name: String(body.name ?? ""), definition: String(body.definition ?? "{}") };
    mutateOverlay((draft) => draft.segments.push(segment));
    return segment as T;
  }
  if (task === "admin-segment-delete") {
    mutateOverlay((draft) => { draft.segments = draft.segments.filter((segment) => segment.id !== body.id); });
    return { ok: true } as T;
  }
  if (task === "admin-adjust-balance") {
    mutateOverlay((draft) => {
      const balance = 0;
      (draft.adjustments[body.account] ??= []).unshift({ id: crypto.randomUUID(), delta: Number(body.delta), balanceAfter: balance + Number(body.delta), reason: String(body.reason ?? ""), adminWallet: "operator", time: Date.now() });
    });
    return { ok: true } as T;
  }
  if (task === "admin-reset-sessions" || task === "admin-resolve-credit") return { ok: true } as T;
  if (task.startsWith("confidential-payments/")) throw new Error("Confidential payment review is not modeled by the vibestack admin machine.");
  throw new Error("The vibestack staging shell does not implement " + task + " yet.");
}

export async function payWithWallet(): Promise<string> {
  throw new Error("Treasury payout transactions are not modeled by the vibestack admin machine.");
}
