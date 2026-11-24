import type { Metadata } from "next";
import { SiteLead } from "@/components/site-lead";
import { ReceiptInspector } from "./receipt-inspector";
import styles from "./verification.module.css";

export const metadata: Metadata = {
  title: "Verify an inference receipt",
  description: "Inspect Sonnely completion evidence and check upstream hashes in your browser.",
  alternates: { canonical: "/verify" },
};

export default function VerificationPage() {
  return (
    <div className="wrap inner-page market-page">
      <SiteLead
        title="Verify an inference receipt"
        description="Review what the serving route reported and check supported signatures and file hashes on this device."
        back={["/docs/attestation", "Attestation guide"]}
      />
      <div className={styles.workspace}>
        <ReceiptInspector />
      </div>
    </div>
  );
}
