import { ArrowRight, ArrowUpRight, Fingerprint, Radio, Terminal, Wallet } from "lucide-react";
import Link from "next/link";
import { CodeExample } from "@/components/shared";
import { Scene } from "@/components/scene";
import { ModelStrip } from "@/components/model-strip";
import { RequestPath } from "@/components/request-path";

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
