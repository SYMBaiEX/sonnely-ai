# Sonnely compute products

## Sonnely Blackboxes

**Deploy inside attested compute. Verify what started before you send a secret.**

A Blackbox is a customer-scoped confidential VM backed by Phala. A customer deploys a measured Docker Compose template and receives an endpoint and an attestation record for the workload. Give them the image digests, measured configuration, and verification result so they can inspect the evidence.

Start with one small CPU VM per customer, one signed worker image, private logs, a fixed TTL, and customer-side encryption for secrets. Admit each run against a quote that includes CPU and persistent disk. Stop on expiry, and make deletion and retained storage visible and separately controllable. Test quote, provision, attest, run, stop, and reconcile as one lifecycle. Use a workspace-scoped server credential held outside the browser. GPU reservations can follow a separate pilot because they have different minimum periods and billing behavior. [Phala CVM lifecycle](https://docs.phala.com/phala-cloud/references/cloud-js-sdk/cvm-lifecycle) · [Phala pricing and quotas](https://cloud.phala.com/about/pricing)

Phala’s pricing documentation says gifted credits apply to CVMs and GPU instances. Confirm the workspace’s grant terms and eligibility before pricing or selling customer capacity. Plan recurring pricing around the paid rates and the disk lifecycle so the product remains viable after promotional credits. [Phala billing policy](https://phala.com/pricing) · [Phala terms](https://phala.com/terms)

## Sonnely Dry Docks

**A clean Linux machine for every run. Keep the artifacts and retire the environment.**

A Dry Dock is a short-lived, dedicated Linux VM inside a Sonnely workflow. Start with a repository test or reproducible build. Take a project snapshot, start one VM per run, stream build logs, return results or artifacts, and retire the VM on success, failure, or timeout. Keep snapshots opt-in and enforce account-level concurrency and spend ceilings.

Boat supplies full Ubuntu VMs with Docker, SSH, and snapshot forking. Its list price starts at $0.018/hour for 2 vCPU and 4 GB, with a $20 monthly minimum. A stopped Boat VM retains its disk, so attach deletion to the retirement flow when the customer chooses ephemeral mode. Disable public service URLs unless requested, and disclose the provider’s network and retention boundary. Market Dry Docks as VM isolation. Attach confidential-compute claims to configurations with actual hardware attestation. [Boat pricing](https://docs.boat.dev/pricing) · [Boat limits](https://docs.boat.dev/limits)

Boat’s Terms distinguish embedded sandboxes in a customer product from resale of plain compute. A managed test or build workflow fits the product direction. Get written approval before offering raw Boat VMs as rentals. Keep Boat credentials server-side and meter each job as a Sonnely product action. [Boat Terms, TOS-7 and TOS-8](https://boat.dev/terms)
