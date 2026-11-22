import Link from "next/link";
import { termsVersion } from "@/lib/policy";
import { ReaderNavigation, SiteLead } from "@/components/site-lead";

export const metadata = {
  title: "Terms of Service",
  description: "Terms for the Sonnely Solana inference workspace.",
};

const sections = [
  ["account", "Account and service"],
  ["credits", "Credits and charges"],
  ["acceptable-use", "Acceptable use and provider terms"],
  ["availability", "Model output and availability"],
  ["questions", "Questions"],
] as const;

export default function TermsPage() {
  return (
    <div className="wrap inner-page market-page">
      <SiteLead title="Terms of Service" description={"Version " + termsVersion} />
      <div className="reader-grid">
        <ReaderNavigation sections={sections} />
        <article className="panel reader-body">
          <h2 id={sections[0][0]}>{sections[0][1]}</h2>
          <p>
            These terms govern your use of the Sonnely console and API at sonnely.com. You must be able to
            enter into this agreement. If you act for an organization, you must have authority to bind it.
            Keep control of your wallet and API keys, and revoke keys you no longer trust.
          </p>
          <h2 id={sections[1][0]}>{sections[1][1]}</h2>
          <p>
            Send Solana mainnet USDC using the payment details in Billing. Credits are posted after a matching
            transfer finalizes. Credits buy inference usage in Sonnely and cannot be transferred or redeemed
            for cash. On-chain transfers are generally irreversible. For a duplicate payment, missing credit,
            or billing dispute, contact Sonnely with the payment reference or public transaction signature.
            Applicable consumer rights still apply.
          </p>
          <p>
            We reserve credits before sending a request and settle the final charge using reported token
            counts at the rates on <Link href="/pricing">Pricing</Link>. Reservations may remain held while an
            incomplete request is investigated.
          </p>
          <h2 id={sections[2][0]}>{sections[2][1]}</h2>
          <p>
            Use Sonnely lawfully and only with inputs you have permission to submit. Respect privacy,
            intellectual-property rights, trade restrictions, and applicable model licenses. Do not use the
            service to harm others, abuse another system, or circumvent service safeguards or limits. Requests
            processed by NEAR AI are subject to applicable restrictions in the{" "}
            <a href="https://near.ai/acceptable-use-policy">NEAR AI Acceptable Use Policy</a> and{" "}
            <a href="https://near.ai/terms-of-service">NEAR AI Cloud Terms</a>. Requests you route to Phala
            are subject to <a href="https://phala.com/terms">Phala’s terms</a>. Requests you route to Tinfoil
            are subject to <a href="https://tinfoil.sh/terms">Tinfoil’s terms</a>. Sonnely may limit or
            suspend access for misuse or where a provider, network, or law requires it.
          </p>
          <h2 id={sections[3][0]}>{sections[3][1]}</h2>
          <p>
            Model output may be inaccurate or unsafe. Verify it before relying on it. Models, rates, and
            supported features may change. The service is provided as available, without warranties to the
            extent permitted by law. See the <Link href="/privacy">Privacy Notice</Link> for how Sonnely
            processes requests and account data.
          </p>
          <h2 id={sections[4][0]}>{sections[4][1]}</h2>
          <p>
            Use <Link href="/contact">Sonnely Support</Link> for questions about these terms, your credits, or
            your account.
          </p>
        </article>
      </div>
    </div>
  );
}
