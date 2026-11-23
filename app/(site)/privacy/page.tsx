import Link from "next/link";
import { termsVersion } from "@/lib/policy";
import { ReaderNavigation, SiteLead } from "@/components/site-lead";

export const metadata = {
  title: "Privacy Notice",
  description: "Data handling for the Sonnely Solana inference workspace.",
};

const sections = [
  ["prompts", "Prompts and model responses"],
  ["wallets", "Wallets, accounts, and payments"],
  ["support", "Support and service providers"],
  ["reporting", "Builds and usage reporting"],
  ["retention", "Retention and your choices"],
] as const;

export default function PrivacyPage() {
  return (
    <div className="wrap inner-page market-page">
      <SiteLead title="Privacy Notice" description={"Version " + termsVersion} />
      <div className="reader-grid">
        <ReaderNavigation sections={sections} />
        <article className="panel reader-body">
          <h2 id={sections[0][0]}>{sections[0][1]}</h2>
          <p>
            Sonnely’s HTTPS gateway receives your prompt and forwards it to a confidential inference provider
            for execution. The gateway does not provide end-to-end encryption from your device to the model
            enclave. The Sonnely usage ledger stores request metadata, such as model, token counts, charge,
            status, and request IDs. It does not store prompt or response bodies. Optional console chat
            history is stored in your browser. Contact us for the data handling terms that apply to the
            compute providers that execute requests.
          </p>
          <h2 id={sections[1][0]}>{sections[1][1]}</h2>
          <p>
            We store your public wallet address, display name, terms acceptance, credit balance, API key
            metadata and hashes, and billing records. Solana transactions, wallet addresses, and transfer
            amounts are publicly visible on-chain. We use an HTTP-only session cookie and a wallet signature
            to sign you in. Sonnely does not need your recovery phrase or private key.
          </p>
          <h2 id={sections[2][0]}>{sections[2][1]}</h2>
          <p>
            Support stores the email address and message you submit with your workspace. We use hosting and
            delivery infrastructure, Convex for account and billing records, and a Solana RPC provider to
            verify payments. We use these records to provide service, reconcile billing, protect accounts,
            investigate failures, and respond to support requests.
          </p>
          <h2 id={sections[3][0]}>{sections[3][1]}</h2>
          <p>
            When available, Dry Docks sends the public repository URL and pinned commit to a Boat sandbox.
            Sonnely keeps build logs and downloadable artifacts for seven days after teardown, and retains the
            run and billing receipt in your workspace. When available, Blackboxes sends the selected image and
            port to its compute provider and publishes workload attestation metadata.
          </p>
          <p>
            For service operations, Sonnely sends settled inference receipts to a private UsageMax project.
            Receipts contain opaque request and trace identifiers, model and route names, timing for gateway
            stages and request attempts, status, token counts, and accounting amounts. These receipts exclude
            prompts, responses, wallet addresses, and API keys.
          </p>
          <p>
            The optional UsageMax export sends model and route names, token counts, timestamps, and settled
            Sonnely charges to the collector you choose. The send uses your UsageMax collector key for that
            request. Sonnely does not keep that key or export prompt bodies, responses, wallet addresses, or
            API-key labels.
          </p>
          <h2 id={sections[4][0]}>{sections[4][1]}</h2>
          <p>
            Billing and security records may be kept to resolve disputes, prevent abuse, and meet legal
            obligations. You can clear local chat history in your browser and revoke API keys in the console.
            To request access, correction, or deletion of data that Sonnely controls, use{" "}
            <Link href="/contact">Sonnely Support</Link>. Sonnely cannot alter public blockchain records.
          </p>
        </article>
      </div>
    </div>
  );
}
