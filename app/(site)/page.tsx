import { ArrowRight, ArrowUpRight, Fingerprint, KeyRound, Radio, Terminal, Wallet } from "lucide-react";
import Link from "next/link";
import { CodeExample } from "@/components/shared";
import { Scene } from "@/components/scene";
import { ModelStrip } from "@/components/model-strip";
import { RequestPath } from "@/components/request-path";

export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <>
      <div className="wrap home">
        <section className="hero">
          <Scene variant="hero" />
          <div className="hero-content">
            <p className="eyebrow">
              <span className="signal" /> Confidential inference
            </p>
            <h1>
              Private AI,
              <br />
              <em>on your terms.</em>
            </h1>
            <p className="hero-description">
              Run models in confidential compute environments. Sign in with Solana and manage your API keys,
              usage, and credits in one workspace.
            </p>
            <div className="actions">
              <Link href="/console" className="button accent">
                Open console <ArrowUpRight size={17} />
              </Link>
              <Link href="/docs" className="button hero-secondary">
                Read the docs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <Link className="hero-meta glass" href="#request-path">
            <span>
              <Radio size={15} /> Execution layer
            </span>
            <strong>
              NEAR AI · Private TEE <ArrowUpRight size={13} />
            </strong>
          </Link>
        </section>
        <div className="strip" aria-label="Platform components">
          <span>
            <Wallet size={17} /> Solana wallet identity
          </span>
          <span>
            <Fingerprint size={17} /> NEAR AI Cloud
          </span>
          <span>
            <Terminal size={17} /> OpenAI-compatible API
          </span>
        </div>
        <ModelStrip />
        <section className="section split code-section">
          <div>
            <p className="eyebrow">Developer quickstart</p>
            <h2>
              Your SDK.
              <br />A different endpoint.
            </h2>
            <p>
              Use the client you already have. Create a workspace key, set a budget, and send a text
              completion.
            </p>
            <Link className="text-link" href="/docs">
              Integration guide <ArrowUpRight size={17} />
            </Link>
          </div>
          <CodeExample />
        </section>
        <RequestPath />
        <section className="section" aria-labelledby="workspace-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Workspace controls</p>
              <h2 id="workspace-title">Know where each request goes.</h2>
            </div>
            <Link className="text-link" href="/pricing">
              See pricing <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="model-cards workspace-features">
            <article className="panel benefit">
              <KeyRound />
              <h3>Give each app its own key</h3>
              <p>
                Set a daily cap, lifetime budget, or expiration from one account. Revoke a key as soon as you
                stop using it.
              </p>
              <Link className="text-link" href="/console/keys">
                Manage keys <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="panel benefit">
              <Terminal />
              <h3>Trace spend back to a request</h3>
              <p>See model, key label, token counts and charges in the usage ledger.</p>
              <Link className="text-link" href="/console/usage">
                View usage <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="panel benefit">
              <Wallet />
              <h3>Fund from a Solana wallet</h3>
              <p>
                When checkout is enabled, fund credits with USDC and follow the payment through finalization.
              </p>
              <Link className="text-link" href="/docs#settlement">
                See how settlement works <ArrowUpRight size={16} />
              </Link>
            </article>
          </div>
        </section>
        <section className="closing">
          <Scene />
          <div>
            <h2>Start in the console.</h2>
            <p>Explore a local sample or connect a Solana wallet.</p>
          </div>
          <Link className="button accent" href="/console">
            Open console <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
