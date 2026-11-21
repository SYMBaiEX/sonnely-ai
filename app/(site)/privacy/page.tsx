import Link from "next/link";
import { termsVersion } from "@/lib/policy";

export const metadata = {
  title: "Privacy Notice",
  description: "Data handling for the Sonnely Solana inference workspace.",
};

export default function PrivacyPage() {
  return (
    <div className="wrap inner-page">
      <header className="page-lead">
        <h1>Privacy Notice</h1>
        <p>Sonnely’s Solana inference workspace · Version {termsVersion}</p>
      </header>
      <article className="panel stack-panel">
        <h2>Prompts and model responses</h2>
        <p>
          Sonnely’s HTTPS gateway receives your prompt and forwards it to the selected inference provider,
          NEAR AI or Phala. The gateway does not provide end-to-end encryption from your device to the model
          enclave. The Sonnely usage ledger stores request metadata, such as model, token counts, charge,
          status, and provider request ID. It does not store prompt or response bodies. Optional console chat
          history is stored in your browser. See the{" "}
          <a href="https://near.ai/privacy-policy">NEAR AI Privacy Policy</a> and{" "}
          <a href="https://phala.com/privacy">Phala Privacy Policy</a> for provider data handling.
        </p>
        <h2>Wallets, accounts, and payments</h2>
        <p>
          We store your public wallet address, display name, terms acceptance, credit balance, API key
          metadata and hashes, and billing records. Solana transactions, wallet addresses, and transfer
          amounts are publicly visible on-chain. We use an HTTP-only session cookie and a wallet signature to
          sign you in. Sonnely does not need your recovery phrase or private key.
        </p>
        <h2>Support and service providers</h2>
        <p>
          Support stores the email address and message you submit with your workspace. We use hosting and
          delivery infrastructure, Convex for account and billing records, and a Solana RPC provider to verify
          payments. We use these records to provide service, reconcile billing, protect accounts, investigate
          failures, and respond to support requests.
        </p>
        <h2>Retention and your choices</h2>
        <p>
          Billing and security records may be kept to resolve disputes, prevent abuse, and meet legal
          obligations. You can clear local chat history in your browser and revoke API keys in the console. To
          request access, correction, or deletion of data that Sonnely controls, use{" "}
          <Link href="/contact">Sonnely Support</Link>. Sonnely cannot alter public blockchain records.
        </p>
      </article>
    </div>
  );
}
