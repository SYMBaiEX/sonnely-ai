"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Cpu, Radio, Terminal } from "lucide-react";
import { Scene } from "./scene";

const steps = [
  {
    label: "Your client",
    short: "Client",
    icon: Terminal,
    description: "Send a text request from the console or your OpenAI-compatible SDK over HTTPS.",
    link: "/docs#quickstart",
    action: "Integration guide",
  },
  {
    label: "Sonnely gateway",
    short: "Gateway",
    icon: Radio,
    description:
      "Sonnely can read the prompt while forwarding it. The usage ledger records request metadata and charges.",
    link: "/docs#privacy",
    action: "Data handling",
  },
  {
    label: "NEAR AI enclave",
    short: "Private TEE",
    icon: Cpu,
    description:
      "The model runs in NEAR AI’s hardware-isolated environment. NEAR AI publishes the attestation evidence.",
    link: "/docs#verification",
    action: "Attestation guide",
  },
] as const;

export function RequestPath() {
  const [active, setActive] = useState(0);
  const step = steps[active];

  return (
    <section className="request-landscape" id="request-path" aria-labelledby="request-path-title">
      <div className="request-stage" data-step={active}>
        <div role="img" aria-label="Illustration of a Japanese forest village">
          <Scene variant="hero" />
        </div>
        <div className="request-track" aria-hidden="true">
          <div className="request-track-line" />
          <div className="request-track-progress">
            <div className="request-track-line" />
          </div>
        </div>
        <div className="request-stations" role="group" aria-labelledby="request-path-title">
          {steps.map(({ label, short, icon: Icon }, index) => (
            <button
              type="button"
              className="request-station"
              key={label}
              aria-label={label}
              aria-pressed={active === index}
              aria-controls="request-path-detail"
              onClick={() => setActive(index)}
            >
              <span className="request-station-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="request-station-label">{short}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="request-caption">
        <h2 id="request-path-title">Follow the request</h2>
        <div id="request-path-detail" aria-live="polite" aria-atomic="true">
          <p>
            <strong>{step.label}.</strong> {step.description}
          </p>
        </div>
        <Link href={step.link} className="text-link">
          {step.action} <ArrowUpRight size={15} />
        </Link>
      </div>
    </section>
  );
}
