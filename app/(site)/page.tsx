import { ArrowDown, ArrowUpRight, Fingerprint, Terminal, Wallet } from "lucide-react";
import Link from "next/link";
import { Scene } from "@/components/scene";
import { HomeModelList } from "@/components/home-model-list";
import { RequestPath } from "@/components/request-path";
import { HomeCapabilities, HomeResources, HomeWorkloads } from "@/components/home-content";
import { HomeDemo } from "@/components/home-demo";
import { WorkspacePreview } from "@/components/workspace-preview";
import "./home.css";

export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <>
      <section className="wrap hero" aria-labelledby="home-hero-heading">
        <div className="hero-content">
          <h1 id="home-hero-heading">
            Confidential <em>inference.</em>
          </h1>
          <p className="hero-description">
            Run NEAR Private TEE models in your apps through an OpenAI-compatible API.
          </p>
          <div className="actions">
            <Link href="/console" className="button accent">
              Open console <ArrowUpRight size={17} />
            </Link>
            <a href="#quickstart" className="button quiet">
              API quickstart <ArrowDown size={16} />
            </a>
          </div>
        </div>
        <div className="hero-art" role="img" aria-label="An illustrated Japanese forest village">
          <Scene variant="hero" />
        </div>
      </section>
      <div className="wrap home">
        <HomeDemo />
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
