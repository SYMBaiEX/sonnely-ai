import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { computeProgress, kind, spec } from "./computeValidators";
import { invoiceProvider, invoiceLineView } from "./providerInvoiceContract";
import { alertDelivery, operationState } from "./operationsContract";
import { gatewayDetails, gatewayReceipt } from "./usageMaxOutboxValidators";

export default defineSchema({
  computeRuns: defineTable({
    account: v.id("accounts"),
    kind,
    spec,
    reference: v.string(),
    active: v.boolean(),
    minutes: v.number(),
    reserve: v.number(),
    hourlyBase: v.number(),
    unitSeconds: v.number(),
    markup: v.number(),
    fixedFee: v.number(),
    charged: v.optional(v.number()),
    base: v.optional(v.number()),
    fee: v.optional(v.number()),
    seconds: v.optional(v.number()),
    nextAt: v.number(),
    lease: v.optional(v.number()),
    stopRequested: v.optional(v.boolean()),
    purgeAt: v.optional(v.number()),
    ...computeProgress,
  })
    .index("by_account_kind", ["account", "kind"])
    .index("by_account_reference", ["account", "reference"])
    .index("by_account_active", ["account", "active"])
    .index("by_kind_active", ["kind", "active"])
    .index("by_ready", ["active", "nextAt"])
    .index("by_purge", ["purgeAt"]),
  accounts: defineTable({
    wallet: v.string(),
    name: v.string(),
    username: v.optional(v.string()),
    onboarding: v.optional(v.union(v.literal("pending"), v.literal("fund"), v.literal("later"))),
    balance: v.number(),
    lastQuote: v.optional(v.number()),
    referral: v.string(),
    termsVersion: v.optional(v.string()),
    termsAcceptedAt: v.optional(v.number()),
    invitedBy: v.optional(v.id("accounts")),
  })
    .index("by_wallet", ["wallet"])
    .index("by_referral", ["referral"])
    .index("by_username", ["username"])
    .index("by_inviter", ["invitedBy"]),
  sessions: defineTable({
    hash: v.string(),
    account: v.id("accounts"),
    expires: v.number(),
  }).index("by_hash", ["hash"]),
  consumedChallenges: defineTable({ nonce: v.string(), expires: v.number() })
    .index("by_nonce", ["nonce"])
    .index("by_expiry", ["expires"]),
  keys: defineTable({
    account: v.id("accounts"),
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
    cap: v.union(v.number(), v.null()),
    dailyCap: v.union(v.number(), v.null()),
    expires: v.union(v.number(), v.null()),
    revoked: v.boolean(),
    lifetime: v.number(),
    lastUsed: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_account", ["account"]),
  keyDays: defineTable({ key: v.id("keys"), day: v.string(), spent: v.number() }).index("by_key_day", [
    "key",
    "day",
  ]),
  launchLimits: defineTable({ bucket: v.string(), window: v.number(), used: v.number() })
    .index("by_bucket_window", ["bucket", "window"])
    .index("by_window", ["window"]),
  usage: defineTable({
    account: v.id("accounts"),
    key: v.optional(v.id("keys")),
    keyName: v.string(),
    keyDay: v.optional(v.string()),
    model: v.string(),
    input: v.number(),
    output: v.number(),
    cost: v.number(),
    provider: v.optional(v.union(v.literal("phala"), v.literal("tinfoil"))),
    providerRequest: v.optional(v.string()),
    retryKey: v.optional(v.string()),
    providerStatus: v.optional(v.number()),
    outcome: v.optional(v.string()),
    settledAt: v.optional(v.number()),
    providerCostNano: v.optional(v.number()),
    providerReportedCostNano: v.optional(v.number()),
    usageMaxDetails: v.optional(gatewayDetails),
    reconcileAfter: v.optional(v.number()),
    reconciliation: v.optional(v.union(v.literal("pending"), v.literal("reconciled"))),
    status: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("unreported"),
    ),
  })
    .index("by_account", ["account"])
    .index("by_account_retryKey", ["account", "retryKey"])
    .index("by_provider_status", ["provider", "status"])
    .index("by_account_status_cost", ["account", "status", "cost"])
    .index("by_account_status_time", ["account", "status"])
    .index("by_reconciliation", ["reconciliation"])
    .index("by_reconciliation_and_reconcileAfter", ["reconciliation", "reconcileAfter"])
    .index("by_status", ["status"])
    .index("by_provider_request", ["providerRequest"]),
  usageMaxOutbox: defineTable({
    receipt: gatewayReceipt,
    state: v.union(v.literal("queued"), v.literal("delivered"), v.literal("failed")),
    nextAt: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    attempts: v.number(),
    purgeAt: v.number(),
  })
    .index("by_request", ["receipt.requestId"])
    .index("by_state_next", ["state", "nextAt"])
    .index("by_state_and_queuedAt", ["state", "queuedAt"])
    .index("by_purge", ["purgeAt"]),
  providerInvoices: defineTable({
    provider: invoiceProvider,
    invoiceId: v.string(),
    recordedBy: v.optional(v.id("accounts")),
    source: v.optional(v.literal("integration")),
    lines: v.array(invoiceLineView),
  }).index("by_provider_and_invoiceId", ["provider", "invoiceId"]),
  providerInvoiceClaims: defineTable({
    reference: v.string(),
    invoice: v.id("providerInvoices"),
    usage: v.id("usage"),
  }).index("by_reference", ["reference"]),
  operationsState: defineTable(operationState.fields).index("by_kind", ["kind"]),
  alertDeliveries: defineTable(alertDelivery.fields)
    .index("by_key", ["key"])
    .index("by_state_and_nextAt", ["state", "nextAt"])
    .index("by_expiry", ["purgeAt"]),
  finance: defineTable({
    reconciled: v.number(),
    customerMicros: v.number(),
    providerNano: v.number(),
    paidMicros: v.number(),
    pendingPayout: v.optional(v.id("payouts")),
  }),
  payouts: defineTable({
    reference: v.string(),
    amount: v.number(),
    recipient: v.string(),
    treasury: v.string(),
    mint: v.string(),
    cluster: v.literal("mainnet"),
    createdBy: v.id("accounts"),
    signature: v.optional(v.string()),
    transaction: v.optional(v.string()),
    lastValidBlockHeight: v.optional(v.number()),
  }).index("by_reference", ["reference"]),
  deposits: defineTable({
    account: v.id("accounts"),
    reference: v.string(),
    recipient: v.string(),
    mint: v.string(),
    cluster: v.string(),
    amount: v.number(),
    sol: v.optional(v.object({ lamports: v.number(), expiresAt: v.number(), priceUsd: v.string() })),
    signature: v.optional(v.string()),
    checkoutTransaction: v.optional(v.object({ transaction: v.string(), lastValidBlockHeight: v.number() })),
    nextCheckAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
  })
    .index("by_reference", ["reference"])
    .index("by_signature", ["signature"])
    .index("by_account", ["account"])
    .index("by_account_cluster_signature", ["account", "cluster", "signature"])
    .index("by_cluster_recipient_signature_next_check", ["cluster", "recipient", "signature", "nextCheckAt"]),
  creditResolutions: defineTable({
    usage: v.id("usage"),
    admin: v.id("accounts"),
    resolution: v.union(v.literal("release"), v.literal("settle")),
    evidence: v.string(),
    held: v.number(),
    charged: v.number(),
  }).index("by_usage", ["usage"]),
  recoveryHealth: defineTable({ checkedAt: v.number(), failures: v.number() }),
  tickets: defineTable({
    account: v.id("accounts"),
    email: v.string(),
    topic: v.string(),
    message: v.string(),
    state: v.optional(v.union(v.literal("in_progress"), v.literal("resolved"))),
    updatedAt: v.optional(v.number()),
    assignedTo: v.optional(v.id("accounts")),
  })
    .index("by_account", ["account"])
    .index("by_state", ["state"]),
  crmEvents: defineTable({
    account: v.id("accounts"),
    admin: v.id("accounts"),
    note: v.string(),
    ticket: v.optional(v.id("tickets")),
    kind: v.union(
      v.literal("note"),
      v.literal("ticket"),
      v.literal("reply"),
      v.literal("task"),
      v.literal("flag"),
      v.literal("adjust"),
    ),
  }).index("by_account", ["account"]),
  adminAudit: defineTable({
    actor: v.id("accounts"),
    action: v.string(),
    targetKind: v.string(),
    targetId: v.string(),
    summary: v.string(),
    meta: v.optional(v.any()),
  })
    .index("by_actor", ["actor"])
    .index("by_action", ["action"])
    .index("by_target", ["targetKind", "targetId"]),
  accountEvents: defineTable({
    account: v.id("accounts"),
    kind: v.string(),
    actor: v.string(),
    summary: v.string(),
  })
    .index("by_account", ["account"])
    .index("by_account_kind", ["account", "kind"]),
  ticketReplies: defineTable({
    ticket: v.id("tickets"),
    author: v.id("accounts"),
    visibility: v.union(v.literal("public"), v.literal("internal")),
    body: v.string(),
  }).index("by_ticket", ["ticket"]),
  accountFlags: defineTable({
    account: v.id("accounts"),
    flag: v.string(),
    note: v.optional(v.string()),
    admin: v.id("accounts"),
  })
    .index("by_account", ["account"])
    .index("by_flag", ["flag"])
    .index("by_account_flag", ["account", "flag"]),
  balanceAdjustments: defineTable({
    account: v.id("accounts"),
    admin: v.id("accounts"),
    delta: v.number(),
    reason: v.string(),
    balanceAfter: v.number(),
  }).index("by_account", ["account"]),
  crmTasks: defineTable({
    account: v.id("accounts"),
    assignee: v.id("accounts"),
    creator: v.id("accounts"),
    title: v.string(),
    dueAt: v.optional(v.number()),
    doneAt: v.optional(v.number()),
  })
    .index("by_account", ["account"])
    .index("by_assignee_done", ["assignee", "doneAt"]),
  savedSegments: defineTable({
    admin: v.id("accounts"),
    name: v.string(),
    definition: v.string(),
  }).index("by_admin", ["admin"]),
});
