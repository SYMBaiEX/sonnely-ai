export const productPages = {
  inference: [
    "Confidential inference",
    "Send a request, stream the response, and meter every call through one OpenAI-compatible API.",
  ],
  observability: [
    "Inference observability",
    "Trace inference through the gateway, compare usage and latency, and reconcile compute costs with UsageMax.",
  ],
  compute: [
    "Compute on Sonnely",
    "Explore attested confidential VMs and isolated build sandboxes on Sonnely.",
  ],
  blackboxes: [
    "Blackboxes",
    "Rent an attested confidential VM. Deploy a pinned container image and inspect the workload attestation.",
  ],
  "dry-docks": [
    "Dry Docks",
    "An isolated build sandbox for pinned public GitHub commits, live logs, and downloadable artifacts.",
  ],
} as const;

export type ProductPage = keyof typeof productPages;

export function isProductPage(value: string): value is ProductPage {
  return Object.hasOwn(productPages, value);
}
