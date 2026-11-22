export const computeProducts = ["blackboxes", "dry-docks"] as const;
export type ComputeProduct = (typeof computeProducts)[number];

export function isComputeProduct(value: string): value is ComputeProduct {
  return value === "blackboxes" || value === "dry-docks";
}

export function computeFeatures() {
  return {
    blackboxes: process.env.SONNELY_BLACKBOX_RENTALS === "true",
    "dry-docks": process.env.SONNELY_DRY_DOCKS === "true",
  };
}

export type ComputeFeatures = ReturnType<typeof computeFeatures>;
