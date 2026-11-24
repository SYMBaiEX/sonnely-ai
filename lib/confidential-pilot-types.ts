export const confidentialPilotAmount = 10_000;

export type ConfidentialPilotOrder = {
  reference: string;
  payer: string;
  treasury: string;
  cluster: "mainnet";
  mint: string;
  amount: number;
  status: "pending" | "finalized";
  createdAt: number;
  signature?: string;
  finalizedAt?: number;
  submission?: {
    signature: string;
    messageHash: string;
    lastValidBlockHeight: number;
  };
};
