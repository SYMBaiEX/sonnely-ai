# Sonnely compute

## Blackboxes

Blackboxes rent Phala TDX compute in 15, 30, 60 or 120 minute windows. Each rental has 1 vCPU, 2 GB RAM and 20 GB disk. A customer supplies a public OCI image pinned by digest and the image’s HTTP port. Sonnely creates a measured Docker Compose configuration, sets a provider deletion deadline, verifies the hardware quote with Phala, and replays the RTMR3 event log to match the Compose, app, and instance measurements before showing the HTTPS endpoint.

Phala’s verifier checks the hardware quote. The downloadable evidence contains the quote, provider verification result and compose hashes. Customers can independently verify the workload measurements. Phala can publish attestation metadata. Application logs and system information are private. Use application authentication for sensitive traffic. The pilot has no secret injection or persistent disks.

## Dry Docks

Dry Docks run public GitHub builds under a full commit SHA in a new Boat Linux VM. The build runs `npm ci` and `npm run build`. The console polls the detached command for live output. An archive of the first matching output directory (`dist`, `build`, `out`, or `.next`) is downloadable up to 5 MiB. Logs and downloadable files expire seven days after teardown.

Boat starts the VM without account environment variables, credentials, or snapshots, and auto-stops it at the time limit. Sonnely stops the VM, reads the final Boat meter and requests permanent deletion. The build receipt settles once deletion is confirmed. No inbound endpoint is provisioned.

## Charges

Both products hold the maximum quote from a signed-in wallet’s Sonnely balance. A billed run costs the provider rate plus a 25% markup and a $0.01 run fee. The final receipt records runtime, base cost, fee and total. Unused held credits return to the wallet’s Sonnely balance. A Blackbox that never delivers evidence and a Boat start with zero metered usage are released without charge. Compute receipts stay outside the inference payout ledger.

| Product    |      Base rate | Meter                                                                |
| ---------- | -------------: | -------------------------------------------------------------------- |
| Blackboxes | $0.060780/hour | CPU and storage, rounded up to a minute, capped by the rental window |
| Dry Docks  |    $0.018/hour | Boat’s reported small VM usage, by the second                        |

## Operations

Store `PHALA_CLOUD_API_KEY` and `BOAT_API_KEY` in the Convex deployment. The Phala credential manages CVMs and is separate from inference credentials. Configure `SONNELY_BLACKBOX_RENTALS=true` or `SONNELY_DRY_DOCKS=true` to accept new jobs after the corresponding provider account is ready. Both switches default off. Set `SONNELY_BLACKBOX_PILOT=true` for paid admin-wallet trials. Disabling starts leaves teardown enabled for existing jobs.

Keep Boat on a paid plan with paid start overages disabled. The worker checks current capacity and rejects starts when Boat reports an overage fee. Confirm Phala’s terms and grant terms before selling customer rentals. Keep gifted credits restricted to the authorized pilot until their commercial eligibility is confirmed.

- [Phala pricing](https://cloud.phala.com/about/pricing)
- [Phala attestation verification](https://docs.phala.com/phala-cloud/attestation/verification-guide)
- [Phala Cloud terms](https://phala.com/terms)
- [Boat pricing](https://docs.boat.dev/pricing)
- [Boat sandbox usage](https://docs.boat.dev/api/reference/sandboxes/get-sandbox-usage)
- [Boat embedded product terms](https://boat.dev/terms#end-users)
