import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  accounts: defineTable({
    wallet: v.string(),
    name: v.string(),
    balance: v.number(),
    lastQuote: v.optional(v.number()),
    referral: v.string(),
    invitedBy: v.optional(v.id("accounts")),
  })
    .index("by_wallet", ["wallet"])
    .index("by_referral", ["referral"])
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
  usage: defineTable({
    account: v.id("accounts"),
    key: v.optional(v.id("keys")),
    keyName: v.string(),
    keyDay: v.optional(v.string()),
    model: v.string(),
    input: v.number(),
    output: v.number(),
    cost: v.number(),
    providerRequest: v.optional(v.string()),
    providerCostNano: v.optional(v.number()),
    reconciliation: v.optional(v.union(v.literal("pending"), v.literal("reconciled"))),
    status: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("unreported"),
    ),
  })
    .index("by_account", ["account"])
    .index("by_reconciliation", ["reconciliation"])
    .index("by_status", ["status"])
    .index("by_provider_request", ["providerRequest"]),
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
    signature: v.optional(v.string()),
  })
    .index("by_reference", ["reference"])
    .index("by_signature", ["signature"])
    .index("by_account", ["account"]),
  tickets: defineTable({
    account: v.id("accounts"),
    email: v.string(),
    topic: v.string(),
    message: v.string(),
  }).index("by_account", ["account"]),
});
