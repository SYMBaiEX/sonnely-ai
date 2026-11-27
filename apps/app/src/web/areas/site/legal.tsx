// spec/app/site/index.md, "Story: Check the service status"
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { CorrespondenceHero } from "./chrome.tsx";
import { termsVersion } from "./data.ts";

function LegalPage({
  eyebrow,
  title,
  description,
  rows,
  other,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rows: readonly (readonly [string, string])[];
  other: readonly [href: string, label: string];
  sections: readonly (readonly [string, string])[];
  children: ReactNode;
}) {
  return (
    <div className="wrap cor-page cor-legal-page">
      <CorrespondenceHero
        eyebrow={eyebrow}
        title={title}
        description={description}
        brief={{ title: "Document", rows }}
        actionsLabel="Legal documents"
        asideLabel="Document"
      >
        <a href={other[0]}>
          {other[1]} <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </CorrespondenceHero>
      <div className="cor-post-layout">
        <aside className="cor-contents" aria-label="Contents">
          <span>Contents</span>
          <ol>
            {sections.map(([id, heading]) => (
              <li key={id}><a href={"#" + id}>{heading}</a></li>
            ))}
          </ol>
        </aside>
        <div className="cor-letter cor-post-letter">
          <div className="cor-letter-head">
            <span>Sonnely legal</span>
            <span>{"Version " + termsVersion}</span>
          </div>
          <div className="cor-letter-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

const privacySections = [
  ["prompts", "Prompts and model responses"],
  ["wallets", "Wallets, accounts, and payments"],
  ["support", "Support and service providers"],
  ["reporting", "Usage reporting"],
  ["retention", "Retention and your choices"],
] as const;

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy Notice · Sonnely"
      title="What Sonnely sees, and what it never stores."
      description="The privacy boundary of the gateway, the account records behind the console, and the choices you keep."
      rows={[
        ["Version", termsVersion],
        ["Prompt bodies", "Never stored"],
        ["Chat history", "Your browser"],
      ]}
      other={["/terms", "Terms of Service"]}
      sections={privacySections}
    >
      <section>
        <h2 id={privacySections[0][0]}>{privacySections[0][1]}</h2>
        <p>
          Sonnely’s HTTPS gateway receives your prompt and forwards it to a confidential inference
          provider for execution. The gateway does not provide end-to-end encryption from your
          device to the model enclave. The Sonnely usage ledger stores request metadata, such as
          model, token counts, charge, status, and request IDs. It does not store prompt or
          response bodies. Optional console chat history is stored in your browser. Contact us for
          the data handling terms that apply to the compute providers that execute requests.
        </p>
      </section>
      <section>
        <h2 id={privacySections[1][0]}>{privacySections[1][1]}</h2>
        <p>
          We store your public wallet address, display name, terms acceptance, credit balance, API
          key metadata and hashes, and billing records. Solana transactions, wallet addresses, and
          transfer amounts are publicly visible on-chain. We use an HTTP-only session cookie and a
          wallet signature to sign you in. Sonnely does not need your recovery phrase or private
          key.
        </p>
      </section>
      <section>
        <h2 id={privacySections[2][0]}>{privacySections[2][1]}</h2>
        <p>
          Support stores the email address and message you submit with your workspace. We use
          hosting and delivery infrastructure on Railway, where account and billing records are
          stored in Sonnely’s own machine state, and a Solana RPC provider to verify payments. We
          use these records to provide service, reconcile billing, protect accounts, investigate
          failures, and respond to support requests.
        </p>
      </section>
      <section>
        <h2 id={privacySections[3][0]}>{privacySections[3][1]}</h2>
        <p>
          For service operations, Sonnely sends settled inference receipts to a private UsageMax
          project. Receipts contain opaque request and trace identifiers, model and route names,
          timing for gateway stages and request attempts, status, token counts, and accounting
          amounts. These receipts exclude prompts, responses, wallet addresses, and API keys.
        </p>
        <p>
          The optional UsageMax export downloads model and route names, token counts, timestamps,
          and settled Sonnely charges for import into the UsageMax project you choose. Sonnely
          does not export prompt bodies, responses, wallet addresses, or API-key labels.
        </p>
      </section>
      <section>
        <h2 id={privacySections[4][0]}>{privacySections[4][1]}</h2>
        <p>
          Billing and security records may be kept to resolve disputes, prevent abuse, and meet
          legal obligations. You can clear local chat history in your browser and revoke API keys
          in the console. To request access, correction, or deletion of data that Sonnely
          controls, use <a href="/contact">Sonnely Support</a>. Sonnely cannot alter public
          blockchain records.
        </p>
      </section>
    </LegalPage>
  );
}

const termsSections = [
  ["account", "Account and service"],
  ["credits", "Credits and charges"],
  ["acceptable-use", "Acceptable use"],
  ["availability", "Model output and availability"],
  ["questions", "Questions"],
] as const;

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of Service · Sonnely"
      title="The agreement behind every request."
      description="Accounts, prepaid credits, acceptable use, and what to expect of model output."
      rows={[
        ["Version", termsVersion],
        ["Credits", "Prepaid, non-transferable"],
        ["Settlement", "Reported usage"],
      ]}
      other={["/privacy", "Privacy Notice"]}
      sections={termsSections}
    >
      <section>
        <h2 id={termsSections[0][0]}>{termsSections[0][1]}</h2>
        <p>
          These terms govern your use of the Sonnely console and API at sonnely.com. You must be
          able to enter into this agreement. If you act for an organization, you must have
          authority to bind it. Keep control of your wallet and API keys, and revoke keys you no
          longer trust.
        </p>
      </section>
      <section>
        <h2 id={termsSections[1][0]}>{termsSections[1][1]}</h2>
        <p>
          Send Solana mainnet USDC or SOL using the payment details in Billing. Credits are posted after
          a matching transfer finalizes. Credits buy inference usage in Sonnely and cannot be
          transferred or redeemed for cash. On-chain transfers are generally irreversible. For a
          duplicate payment, missing credit, or billing dispute, contact Sonnely with the payment
          reference or public transaction signature. Applicable consumer rights still apply.
        </p>
        <p>
          We reserve credits before sending a request and settle the final charge using reported
          token counts at the rates on <a href="/pricing">Pricing</a>. Reservations may
          remain held while an incomplete request is investigated.
        </p>
      </section>
      <section>
        <h2 id={termsSections[2][0]}>{termsSections[2][1]}</h2>
        <p>
          Use Sonnely lawfully and only with inputs you have permission to submit. Respect
          privacy, intellectual-property rights, trade restrictions, and applicable model
          licenses. Do not use the service to harm others, abuse another system, or circumvent
          service safeguards or limits. Requests are subject to the acceptable-use policies of the
          compute providers that execute them. Sonnely may limit or suspend access for misuse or
          where an upstream provider, network, or law requires it.
        </p>
      </section>
      <section>
        <h2 id={termsSections[3][0]}>{termsSections[3][1]}</h2>
        <p>
          Model output may be inaccurate or unsafe. Verify it before relying on it. Models, rates,
          and supported features may change. The service is provided as available, without
          warranties to the extent permitted by law. See the <a href="/privacy">Privacy Notice</a>{" "}
          for how Sonnely processes requests and account data.
        </p>
      </section>
      <section>
        <h2 id={termsSections[4][0]}>{termsSections[4][1]}</h2>
        <p>
          Use <a href="/contact">Sonnely Support</a> for questions about these terms, your
          credits, or your account.
        </p>
      </section>
    </LegalPage>
  );
}
