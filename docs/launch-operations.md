# Sonnely launch operations

## Compute availability

Set `SONNELY_BLACKBOX_RENTALS=false` and `SONNELY_DRY_DOCKS=false` on both Vercel and Convex. The web build uses these values for public discovery, docs and console navigation. Convex independently enforces the flags before reserving credits. Existing runs continue through settlement and teardown.

## Before onboarding a cohort

- Walk one new wallet through setup, optional funding, and one paid text completion on desktop and mobile. Admin shows 14-day onboarding milestones. Check the request reference in Usage and the finalized payment reference in Billing.
- Check that the configured support inbox accepts mail without a wallet session. When resolving held credits, check the billing reference with the provider before changing a balance. An administrator must have signed in within the last 10 minutes to approve a resolution or open a payout. The treasury wallet still signs the payout transaction.
- Open Admin → Inference ops and use **Send test alert**. Confirm receipt in the Sonnely alerts panel in the private operator mailbox. This path stores alerts in R2 so delivery continues if the inbox reaches the Durable Objects write quota. The Cloudflare email fallback requires an allowed recipient. Set `SONNELY_ALERT_FALLBACK_WEBHOOK` in Convex to an operator-owned Slack incoming webhook if available, and confirm a test there as well. Slack acceptance is reported separately. Set `SONNELY_HEARTBEAT_ENABLED=true` on the independent Cloudflare mail Worker after confirming test delivery. Its hourly check alerts after two failed reads of `/api/health` or an unverified provider probe. Catalog probes are non-billable and measure reachability. Use a separately budgeted completion canary if you need proof of live inference.
- Keep separate balance alerts or credit floors in the provider accounts. Convex starts with 20 concurrent requests and $25 of accumulated daily reservations per provider. The accounting day starts at midnight UTC. Failed and incomplete attempts still consume the daily allowance because they may incur provider costs. Adjust these defaults to the funded provider limits. Set `SONNELY_PAUSED_PROVIDERS` on Vercel to pause individual routes.
- Rotate keys that were shared outside the deployment secret store. Rotate one provider at a time and verify a scoped request with the replacement key before revoking the old one.

## Cross-chain funding widget

Keep `SONNELY_NEAR_INTENTS_FUNDING=false` on the web deployment to disable both the cross-chain funding UI and the quote API. The flag defaults to off and only the literal `true` enables it.

To restore the widget, confirm the [Aurora Widget Studio](https://studio.aurora.dev/) configuration targets USDC on Solana and lets customers enter their own Solana recipient. Set its public iframe URL as `SONNELY_INTENTS_WIDGET_URL` and enable the flag. With the flag enabled and the widget URL unset, Billing uses the server-backed quote form. The quote API uses the separate `NEAR_INTENTS_API_KEY` credential.

## Statements and payouts

The push import endpoint accepts the normalized statement shape below. To poll an operator-owned HTTPS exporter hourly, set `SONNELY_STATEMENT_FEED_URL` and its bearer token `SONNELY_STATEMENT_FEED_TOKEN` in Convex. Return an array of up to six finalized statements, with at most 100 lines per statement. Use stable invoice IDs and include each statement's complete batch on retries. Keep unmatched statements in the feed until their references match.

```json
[
  {
    "provider": "phala",
    "invoiceId": "phala-2026-11-page-1",
    "currency": "USD",
    "lines": [
      { "reference": "example-provider-reference", "costNanos": 42000 }
    ]
  }
]
```

Production polls the authenticated Cloudflare Worker in `ops/provider-statements` hourly. It reads `statements.json` from the private `sonnely-provider-statements` R2 bucket. Use a finalized provider statement with exact provider request references and integer nano-USD costs (one US dollar is one billion nanos). NEAR's request-cost API and its grouped usage CSV serve different purposes and do not establish invoice confirmation. Keep the original statement for audit and upload the normalized batch from an authorized account.

```sh
wrangler r2 object put sonnely-provider-statements/statements.json --file ./statements.json --content-type application/json --remote
```

Check the latest invoice sync in Admin → Inference ops after the hourly run, or run `operations:importStatements` against the intended Convex deployment. A successful check with zero statements means the feed is reachable and waiting for files.

Check the statement ID and the source's amounts in Admin. Inspect unmatched and variance rows and verify all three providers before reporting platform margin as reconciled. Feed ingestion updates reporting and does not move funds. The current payout ledger still uses the existing NEAR realized-margin calculation and manual treasury approval.

## Restore drill

1. Verify production backup frequency and retention in Convex. Export a snapshot to encrypted operator-controlled storage if required by the recovery procedure.
2. Restore to an isolated deployment with external mail, payments, inference, imports, and provider credentials disabled. Never start with an overwrite of production.
3. Compare spendable balances, credit holds, confirmed deposits, settlement totals and pending payout IDs against the backup and finalized Solana transactions. Exercise one synthetic deposit and request to check exact-once settlement.
4. Record elapsed time, latest recoverable transaction and outstanding exceptions. Review any changes needed before reconnecting payment recovery or enabling inference.

Set `SONNELY_SUPPORT_WALLETS` for ticket operators and `SONNELY_FINANCE_WALLETS` for invoice operators. Review the allowlists regularly. Full administrators and treasury signers use their existing wallet permissions.
