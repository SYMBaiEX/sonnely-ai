import { ArrowRight, ArrowUpRight, BadgeCheck, Fingerprint, Radio, Terminal, Wallet } from "lucide-react";
import Link from "next/link";
import { CodeExample } from "@/components/shared";
import { Scene } from "@/components/scene";
import { ModelStrip } from "@/components/model-strip";

export default function Home() {
  return (
    <>
      <div className="wrap">
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
          <div className="hero-meta glass">
            <span>
              <Radio size={15} /> Execution layer
            </span>
            <strong>NEAR AI · Private TEE</strong>
          </div>
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
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Data handling</p>
              <h2>
                Know where your
                <br />
                request runs.
              </h2>
            </div>
            <Link className="text-link" href="/docs#privacy">
              Read the privacy model <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="model-cards">
            <article className="panel benefit">
              <BadgeCheck />
              <h3>Hardware isolation</h3>
              <p>
                The model catalog uses NEAR AI’s Private TEE tier. Review the provider’s attestation evidence
                directly.
              </p>
            </article>
            <article className="panel benefit">
              <Terminal />
              <h3>Metadata-only usage</h3>
              <p>
                Relay’s account ledger records model IDs, token counts, request status, and cost. Saved chat
                history is optional and local.
              </p>
            </article>
            <article className="panel benefit">
              <Wallet />
              <h3>Wallet-owned access</h3>
              <p>
                Sign a message with your Solana wallet. Create revocable API keys with optional daily and
                lifetime budgets.
              </p>
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
