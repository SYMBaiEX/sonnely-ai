import { ArrowDown, ArrowUpRight, Fingerprint, Terminal, Wallet } from "lucide-react";
import Link from "next/link";
import { Scene } from "@/components/scene";
import { HomeModelList } from "@/components/home-model-list";
import { RequestPath } from "@/components/request-path";
import { HomeCapabilities, HomeResources, HomeWorkloads } from "@/components/home-content";
import { HomeDemo } from "@/components/home-demo";
import { PlatformLinks } from "@/components/product-pages";
import { WorkspacePreview } from "@/components/workspace-preview";
import "./home.css";

export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="home-hero-heading">
        <div className="wrap hero-intro">
          <h1 id="home-hero-heading">
            Private AI<span>.</span>
          </h1>
          <div className="hero-content">
            <p className="hero-description">
              Confidential inference for your apps. Choose NEAR AI, Phala, or Tinfoil through one
              OpenAI-compatible API.
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
        </div>
        <RequestPath />
      </section>
      <div className="wrap home">
        <HomeDemo />
        <nav className="home-platform" aria-label="Platform integrations">
          <Link href="/docs/billing">
            <Wallet size={18} aria-hidden="true" />
            <span>
              <strong>Solana</strong>
              <small>Wallet sign-in and USDC funding</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link href="/inference#routing">
            <Fingerprint size={18} aria-hidden="true" />
            <span>
              <strong>Confidential providers</strong>
              <small>NEAR AI, Phala, and Tinfoil</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link href="/docs/api">
            <Terminal size={18} aria-hidden="true" />
            <span>
              <strong>OpenAI-compatible API</strong>
              <small>Chat Completions</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>
        <HomeCapabilities />
        <PlatformLinks />
        <HomeModelList />
        <HomeWorkloads />
        <WorkspacePreview />
        <HomeResources />
        <section className="closing home-closing">
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
