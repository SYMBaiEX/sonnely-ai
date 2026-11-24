export const confidentialUsdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const confidentialPaymentHoldMs = 60 * 60 * 1000;

export type ConfidentialReviewReason = "details-encrypted" | "amount-mismatch" | "asset-mismatch";

export type ConfidentialPayment = {
  reference: string;
  payer: string;
  treasury: string;
  cluster: "mainnet";
  mint: string;
  amount: number;
  status: "awaiting_payment" | "under_review" | "credited" | "rejected" | "cancelled" | "expired";
  createdAt: number;
  expiresAt: number;
  cancelledAt?: number;
  signature?: string;
  slot?: number;
  blockTime?: number;
  submittedAt?: number;
  resolvedAt?: number;
  reason?: string;
  reviewReason?: ConfidentialReviewReason;
};

export type ConfidentialPaymentsSnapshot = {
  available: boolean;
  order: ConfidentialPayment | null;
  history: ConfidentialPayment[];
};

export const solflarePrivateModeGuide = "https://www.solflare.com/guides/how-to-use-private-mode/";

export function confidentialPaymentStatus(payment: ConfidentialPayment, now = Date.now()) {
  if (payment.status === "awaiting_payment" && payment.expiresAt <= now) return "Expired";
  return {
    awaiting_payment: "Awaiting payment",
    under_review: "Under review",
    credited: "Credited",
    rejected: "Needs attention",
    cancelled: "Cancelled",
    expired: "Expired",
  }[payment.status];
}
