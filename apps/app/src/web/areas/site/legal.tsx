// spec/app/site/index.md, "Story: Check the service status"
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
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
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 text-foreground md:px-8 md:py-12">
      <header className="mb-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid justify-items-start gap-4">
          <p className="font-mono text-micro font-medium uppercase tracking-micro text-primary">{eyebrow}</p>
          <h1 className="max-w-[13ch] [font-family:var(--font-serif)] text-title font-regular leading-title tracking-title text-balance">{title}</h1>
          <p className="max-w-[620px] text-lead leading-lead text-muted-foreground text-pretty">{description}</p>
          <nav aria-label="Legal documents">
            <a href={other[0]} className="inline-flex min-h-11 items-center gap-1.5 text-ui font-strong text-primary no-underline hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:outline-none">
              {other[1]} <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <aside aria-label="Document" className="rounded-lg border border-border bg-card p-4 shadow-md">
          <h2 className="font-mono text-micro font-medium uppercase tracking-micro text-primary">Document</h2>
          <dl className="mt-3 grid gap-3">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0">
                <dt className="text-meta text-muted-foreground">{label}</dt>
                <dd className="text-ui font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </header>
      <div className="grid items-start justify-center gap-8 lg:grid-cols-[210px_minmax(0,740px)]">
        <aside className="grid gap-3 rounded-lg border border-dashed border-border bg-card/90 p-4 max-lg:order-2 lg:sticky lg:top-[calc(var(--site-header-height)+1.75rem)] lg:-rotate-1" aria-label="Contents">
          <span className="font-mono text-micro font-medium uppercase tracking-micro text-primary">Contents</span>
          <ol className="grid gap-2.5">
            {sections.map(([id, heading], index) => (
              <li key={id} className="grid grid-cols-[1.375rem_minmax(0,1fr)] gap-1.5">
                <span className="[font-family:var(--font-serif)] text-body leading-heading text-primary">{String(index + 1).padStart(2, "0")}</span>
                <a href={"#" + id} className="text-micro leading-micro text-muted-foreground no-underline hover:text-primary focus-visible:text-primary focus-visible:outline-none">{heading}</a>
              </li>
            ))}
          </ol>
        </aside>
        <article className="overflow-hidden rounded-lg border border-border bg-card shadow-lg max-lg:order-1">
          <div className="flex justify-between gap-3.5 border-b border-border bg-accent/40 px-5 py-3.5 font-mono text-micro font-medium uppercase tracking-micro text-primary md:px-8">
            <span>Sonnely legal</span>
            <span>{"Version " + termsVersion}</span>
          </div>
          <div className="p-6 md:p-10 [&_a]:text-primary [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:[font-family:var(--font-serif)] [&_h2]:text-heading [&_h2]:font-regular [&_h2]:leading-heading [&_h2]:tracking-heading [&_h2]:text-balance [&_p]:my-4 [&_p]:text-body [&_p]:leading-body [&_p]:text-foreground/85 [&_p]:text-pretty [&_section+section]:mt-8">
            {children}
          </div>
        </article>
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
        ["Usage ledger", "Metadata only, no prompt bodies"],
        ["Chat history", "Server-side per wallet, yours to clear"],
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
          response bodies. Console playground chat history — the prompts and answers of your
          conversations — is stored server-side under your wallet so conversations reopen on any
          device. It is ordinary service data held outside the confidential enclaves that run the
          models. In Settings you can turn chat history off so new
          conversations live only in your browser session, and you can erase the stored history at
          any time. Contact us for the data handling terms that apply to the compute providers
          that execute requests.
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
          legal obligations. You can turn off or clear the chat history the server keeps for your
          wallet in the console Settings, and revoke API keys in the console. To request access,
          correction, or deletion of data that Sonnely
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
