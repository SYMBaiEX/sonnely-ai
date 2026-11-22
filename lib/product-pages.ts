export const productPages = {
  inference: [
    "Confidential inference",
    "Choose a confidential provider, stream responses, and meter every request through one OpenAI-compatible API.",
  ],
  observability: [
    "Inference observability",
    "Trace inference through the gateway, compare usage and latency, and reconcile provider costs with UsageMax.",
  ],
  compute: [
    "Compute on Sonnely",
    "Rent attested confidential VMs through Blackboxes or explore the upcoming Dry Docks build sandbox.",
  ],
  blackboxes: [
    "Blackboxes",
    "Rent a confidential VM powered by Phala Cloud. Deploy a pinned container image and inspect the workload attestation.",
  ],
  "dry-docks": [
    "Dry Docks",
    "An upcoming isolated build sandbox for pinned public GitHub commits, live logs, and downloadable artifacts.",
  ],
} as const;

export type ProductPage = keyof typeof productPages;

export function isProductPage(value: string): value is ProductPage {
  return Object.hasOwn(productPages, value);
}
