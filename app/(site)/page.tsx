import { ArrowRight, ArrowUpRight, Fingerprint, Terminal, Wallet } from "lucide-react";
import Link from "next/link";
import { CodeExample } from "@/components/shared";
import { Scene } from "@/components/scene";
import { HomeModelList } from "@/components/home-model-list";
import { RequestPath } from "@/components/request-path";
import { HomeCapabilities, HomeResources, HomeWorkloads } from "@/components/home-content";
import { HomeDemo } from "@/components/home-demo";
import { WorkspacePreview } from "@/components/workspace-preview";

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
          <HomeDemo />
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
        <HomeCapabilities />
        <HomeModelList />
        <HomeWorkloads />
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
          <div className="code-visual">
            <img src="/homepage/quickstart.webp" alt="" width={960} height={640} loading="lazy" />
            <CodeExample />
          </div>
        </section>
        <RequestPath />
        <WorkspacePreview />
        <HomeResources />
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
