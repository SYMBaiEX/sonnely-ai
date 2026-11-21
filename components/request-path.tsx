"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Cpu, Radio, Terminal } from "lucide-react";
import { Scene } from "./scene";

const steps = [
  {
    label: "Your client",
    icon: Terminal,
    title: "Start in the console or your SDK.",
    description:
      "The browser sends requests over HTTPS. Turn on local chat history to keep a copy on this device.",
    link: "/docs#quickstart",
    action: "Integration guide",
  },
  {
    label: "Sonnely gateway",
    icon: Radio,
    title: "The gateway validates and meters.",
    description:
      "Sonnely can read the prompt while forwarding it. The usage ledger records request metadata and charges.",
    link: "/docs#privacy",
    action: "Data handling",
  },
  {
    label: "NEAR AI enclave",
    icon: Cpu,
    title: "Inference runs in a Private TEE.",
    description:
      "These models run in hardware-isolated environments. NEAR AI publishes the attestation evidence.",
    link: "/docs#verification",
    action: "Attestation guide",
  },
];

export function RequestPath() {
  const [active, setActive] = useState(0);
  const step = steps[active];

  return (
    <section className="section request-section" id="request-path" aria-labelledby="request-title">
      <header className="section-head">
        <div>
          <p className="eyebrow">Data handling</p>
          <h2 id="request-title">Follow your request.</h2>
        </div>
        <Link className="text-link" href="/docs#privacy">
          Read the privacy model <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="request-grid">
        <div className="request-scene">
          <Scene variant="feature" />
        </div>
        <div className="panel request-panel">
          <div className="request-steps" role="group" aria-label="Request stages">
            {steps.map(({ label, icon: Icon }, index) => (
              <button
                type="button"
                key={label}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                <Icon size={17} aria-hidden />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div key={step.label} className="request-detail" aria-live="polite">
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <Link className="text-link" href={step.link}>
              {step.action} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
