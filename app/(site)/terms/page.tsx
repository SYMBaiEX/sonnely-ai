import Link from "next/link";
import { termsVersion } from "@/lib/policy";

export const metadata = {
  title: "Terms of Service",
  description: "Terms for the Sonnely Solana inference workspace.",
};

export default function TermsPage() {
  return (
    <div className="wrap inner-page">
      <header className="page-lead">
        <h1>Terms of Service</h1>
        <p>Sonnely’s Solana inference workspace · Version {termsVersion}</p>
      </header>
      <article className="panel stack-panel">
        <h2>Account and service</h2>
        <p>
          These terms govern your use of the Sonnely console and API at sonnely.com. You must be able to enter
          into this agreement. If you act for an organization, you must have authority to bind it. Keep
          control of your wallet and API keys, and revoke keys you no longer trust.
        </p>
        <h2>Credits and charges</h2>
        <p>
          Send Solana mainnet USDC using the payment details in Billing. Credits are posted after a matching
          transfer finalizes. Credits buy inference usage in Sonnely and cannot be transferred or redeemed for
          cash. On-chain transfers are generally irreversible. For a duplicate payment, missing credit, or
          billing dispute, contact Sonnely with the payment reference or public transaction signature.
          Applicable consumer rights still apply.
        </p>
        <p>
          We reserve credits before sending a request and settle the final charge using reported token counts
          at the rates on <Link href="/pricing">Pricing</Link>. Reservations may remain held while an
          incomplete request is investigated.
        </p>
        <h2>Acceptable use and provider terms</h2>
        <p>
          Use Sonnely lawfully and only with inputs you have permission to submit. Respect privacy,
          intellectual-property rights, trade restrictions, and applicable model licenses. Do not use the
          service to harm others, abuse another system, or circumvent service safeguards or limits. Requests
          processed by NEAR AI are subject to applicable restrictions in the{" "}
          <a href="https://near.ai/acceptable-use-policy">NEAR AI Acceptable Use Policy</a> and{" "}
          <a href="https://near.ai/terms-of-service">NEAR AI Cloud Terms</a>. Sonnely may limit or suspend
          access for misuse or where a provider, network, or law requires it.
        </p>
        <h2>Model output and availability</h2>
        <p>
          Model output may be inaccurate or unsafe. Verify it before relying on it. Models, rates, and
          supported features may change. The service is provided as available, without warranties to the
          extent permitted by law. See the <Link href="/privacy">Privacy Notice</Link> for how Sonnely
          processes requests and account data.
        </p>
        <h2>Questions</h2>
        <p>
          Use <Link href="/contact">Sonnely Support</Link> for questions about these terms, your credits, or
          your account.
        </p>
      </article>
    </div>
  );
}
