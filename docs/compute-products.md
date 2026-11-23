# Sonnely compute

## Blackboxes

Blackboxes rent Phala TDX compute in 15, 30, 60 or 120 minute windows. Choose a Small (1 vCPU, 2 GB RAM), Medium (2 vCPU, 4 GB RAM), or Large (4 vCPU, 8 GB RAM) Phala TDX machine with 20, 40, or 80 GB of temporary SSD. Phala selects an available node. Choose the pinned NGINX, HTTP playground, or request inspector preset, or supply a public Docker Hub or GHCR image pinned by digest and its HTTP port. Sonnely creates a measured Docker Compose configuration, sets a provider deletion deadline, verifies the hardware quote with Phala, and replays the RTMR3 event log to match the Compose, app, and instance measurements before showing the HTTPS endpoint.

Phala’s verifier checks the hardware quote. The downloadable evidence contains the quote, provider verification result and compose hashes. Customers can independently verify the workload measurements. Phala can publish attestation metadata. Application logs and system information are private. Use application authentication for sensitive traffic. The pilot has no secret injection or persistent disks.

### Agent framework presets

Hermes Agent, OpenClaw, ElizaOS, Mastra, and Pydantic AI have guided presets. Each starts with a Medium TDX machine, 40 GB of temporary SSD, and a suggested HTTP port. Supply a configured public Linux amd64 image pinned by digest. The image must start its own authenticated server and listen on the selected port. Frameworks that require runtime credentials need a secure way to load them. Keep credentials outside the image.

## Dry Docks

Dry Docks run public GitHub builds under a full commit SHA in a new Boat Linux VM. The build runs `npm ci` and `npm run build`. The console polls the detached command for live output. An archive of the first matching output directory (`dist`, `build`, `out`, or `.next`) is downloadable up to 5 MiB. Logs and downloadable files expire seven days after teardown.

Boat starts the VM without account environment variables, credentials, or snapshots, and auto-stops it at the time limit. Sonnely stops the VM, reads the final Boat meter and requests permanent deletion. The build receipt settles once deletion is confirmed. No inbound endpoint is provisioned.

## Charges

Both products hold the maximum quote from a signed-in wallet’s Sonnely balance. A Blackbox quote uses the selected Phala machine rate plus per-GB SSD pricing. A billed run costs the provider rate plus a 25% markup and a $0.01 run fee. The final receipt records runtime, base cost, fee and total. Unused held credits return to the wallet’s Sonnely balance. A Blackbox that never delivers evidence and a Boat start with zero metered usage are released without charge. Compute receipts stay outside the inference payout ledger.

| Product    |           Base rate | Meter                                                            |
| ---------- | ------------------: | ---------------------------------------------------------------- |
| Blackboxes | From $0.060780/hour | CPU and SSD, rounded up to a minute, capped by the rental window |
| Dry Docks  |         $0.018/hour | Boat’s reported small VM usage, by the second                    |

## Operations

Store `PHALA_CLOUD_API_KEY` and `BOAT_API_KEY` in the Convex deployment. The Phala credential manages CVMs and is separate from inference credentials. Configure `SONNELY_BLACKBOX_RENTALS=true` or `SONNELY_DRY_DOCKS=true` to accept new jobs after the corresponding provider account is ready. Both switches default off. Mirror them on the web host to expose product pages and console navigation. Disabling starts leaves teardown enabled for existing jobs.

Keep Boat on a paid plan with paid start overages disabled. The worker checks current capacity and rejects starts when Boat reports an overage fee. Confirm Phala’s terms and grant terms before selling customer rentals. Keep gifted credits restricted to the authorized pilot until their commercial eligibility is confirmed.

- [Phala pricing](https://cloud.phala.com/about/pricing)
- [Phala attestation verification](https://docs.phala.com/phala-cloud/attestation/verification-guide)
- [Phala Cloud terms](https://phala.com/terms)
- [Boat pricing](https://docs.boat.dev/pricing)
- [Boat sandbox usage](https://docs.boat.dev/api/reference/sandboxes/get-sandbox-usage)
- [Boat embedded product terms](https://boat.dev/terms#end-users)

### Verify a Dry Dock release

Use **Check Boat capacity** on the Sonnely Admin page and verify that the Boat workspace is paid and can start small VMs. The first plan requires Stripe card checkout. A trial remains unpaid until Boat registers the first payment. Dry Docks checks payment and capacity before requesting a sandbox.

From the Dry Docks page, fill in the pinned MDN example and select a five-minute limit. The run timeline shows provisioning, build, teardown, and settlement. Download the artifact and receipt, compare the receipt’s released credits with the balance, and confirm Boat reports completed deletion. The receipt remains accessible after logs and artifacts expire.

### UsageMax integration

In **Console > Usage**, export up to 100 settled inference requests from the selected date range. Download a UsageMax telemetry batch or send it directly to a workspace with an advanced write-only collector key. Use a dedicated collector and retain the same installation UUID when sending again. The request carries model and provider names, counters, timestamps, and ledger charges. Sonnely creates stable opaque event keys for deduplication. No service credential or collector key stays in Sonnely after the send.

- [Boat Billing](https://boat.dev/dashboard?tab=billing)

For platform reporting, provision separate write and reporting credentials in the same UsageMax
project. Deploy Convex before the Sonnely frontend. Set `USAGEMAX_GATEWAY_INGEST_TOKEN` on
Convex and `USAGEMAX_GATEWAY_REPORT_TOKEN` on the frontend server. Set
`USAGEMAX_GATEWAY_PROJECT_ID` there to link the latest receipt from Admin. Never expose the
credentials to a client build.

With ingestion enabled, each new final settlement queues a receipt with a stable, opaque trace ID.
Settled streams include the time the gateway first saw output, where available. Delivery
runs asynchronously, retries with backoff, and expires outbox records after 30 days. NEAR provider
cost reconciliation updates a queued or previously delivered receipt without altering its original
settlement time or customer charge. Admin reads UsageMax only after validating the Sonnely
administrator session and labels truncated reports. Wallet credits, payout calculations, and
manual usage export continue to use Sonnely records.

In **Console > Admin > Inference ops**, filter private analytics by UTC period and group by day,
model or provider. Open a trace to inspect its credit reservation, provider attempt, evidence
verification and settlement. Pending requests can receive a recovery span when a hold is resolved.
The report covers up to 2,000 newest retained receipts and labels incomplete reporting, missing cost
coverage and outbox failures.

For a finalized provider statement, paste up to 100 normalized CSV lines with
`reference,cost_usd` under **Invoice reconciliation**. Use the billing reference shown in the provider
report and the exact USD amount with up to nine decimal places. Preview matches and variances,
then record the verified statement. Eligible receipts receive an invoice-confirmed revision, without
modifying the customer ledger or payout accounting. Unmatched lines can be retried from invoice
history. Historical rows outside the 30-day export window retain their reconciliation in Sonnely.

A local loopback Convex deployment only sends receipts when
`USAGEMAX_GATEWAY_LOCAL_PORT` points to a loopback receiver. Run the focused receipt test against a
disposable local deployment with `SONNELY_GATEWAY_LOCAL_TEST=1` and the local service secret.

- [UsageMax telemetry API](https://usagemax.com/docs)

### Scheduled reconciliation and email

Convex checks pending NEAR AI receipts every five minutes against the provider’s
per-request billing API. Unresolved costs stay pending and retry. A matched
provider cost can update the settlement ledger. Treasury payout approval and
signing are manual.

Invoice exports with stable provider references can be submitted by a trusted
server integration to `POST /api/internal/provider-invoices`. The endpoint
requires the server-only `SONNELY_INVOICE_IMPORT_TOKEN` as a bearer token, accepts
USD statements of up to 100 lines, and deduplicates by provider and invoice ID.
Phala and Tinfoil require matching statement exports. NEAR’s per-request cost
reports and finalized invoices are tracked independently.

UsageMax alert opens and resolutions are queued for delivery when the
operations email destination has been configured. In **Admin → Inference
ops**, the operations panel reports synchronization and email status and can
queue a test message. The email includes the provider, alert type, and a link
to Admin. The configured Sonnely inbox transport records delivery after the
message is stored and deduplicates retries by alert ID.

### Crypto funding

Billing accepts direct USDC payments on Solana. Credits post after Solana
finality. See the [launch operations runbook](launch-operations.md#cross-chain-funding-widget)
for the cross-chain funding feature flag.
