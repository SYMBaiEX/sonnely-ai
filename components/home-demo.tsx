"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Command, Cpu } from "lucide-react";
import { models } from "@/lib/models";

const examples = [
  {
    label: "Summarize",
    prompt: "Turn these handoff notes into a brief.",
    output: "Three follow-ups remain. Confirm the deadline, review the draft, and share the revised plan.",
    model: models[0],
  },
  {
    label: "Extract",
    prompt: "Extract the owner and due date.",
    output: '{ "owner": "Rin", "due": "Friday" }',
    model: models[1],
  },
  {
    label: "Explain",
    prompt: "What does this retry function do?",
    output:
      "It retries transient failures with a longer delay after each attempt. Permanent errors stop the loop.",
    model: models[2],
  },
] as const;

export function HomeDemo() {
  const [active, setActive] = useState<number>(0);
  const example = examples[active];
  return (
    <section className="hero-demo glass" aria-label="Sample request preview">
      <div className="hero-demo-top">
        <span>
          <Command size={15} aria-hidden /> Request preview
        </span>
        <span className="caption">Sample</span>
      </div>
      <div role="group" className="hero-demo-choices" aria-label="Choose a sample task">
        {examples.map(({ label }, index) => (
          <button type="button" key={label} aria-pressed={active === index} onClick={() => setActive(index)}>
            {label}
          </button>
        ))}
      </div>
      <div className="hero-demo-output" aria-live="polite">
        <p className="hero-demo-prompt">{example.prompt}</p>
        <p className={active === 1 ? "mono" : ""}>{example.output}</p>
      </div>
      <div className="hero-demo-bottom">
        <span>
          <Cpu size={14} aria-hidden /> {example.model.name}
        </span>
        <Link
          className="text-link"
          href={"/console?model=" + encodeURIComponent(example.model.id)}
          aria-label={"Open " + example.model.name + " in playground"}
        >
          Playground <ArrowUpRight size={14} />
        </Link>
      </div>
    </section>
  );
}
