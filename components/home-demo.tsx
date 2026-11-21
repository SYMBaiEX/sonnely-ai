"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Cpu, Terminal } from "lucide-react";
import { apiBasePath, apiOrigin } from "@/lib/api-contract";
import { models } from "@/lib/models";
import { CopyButton } from "./shared";

const examples = [
  {
    label: "Summarize",
    instruction: "Turn these handoff notes into a brief.",
    input: "Confirm the deadline with Rin. Review the draft Thursday. Share the revised plan afterward.",
    output:
      "Confirm the deadline with Rin, review the draft on Thursday, and share the revised plan afterward.",
    model: models[0],
  },
  {
    label: "Extract",
    instruction: "Extract the owner and due date as JSON.",
    input: "Rin will deliver the revised plan on Friday.",
    output: '{ "owner": "Rin", "due": "Friday" }',
    model: models[1],
  },
  {
    label: "Explain",
    instruction: "Explain what this retry delay does.",
    input: "const delay = attempt => 250 * 2 ** attempt;",
    output: "The delay starts at 250 milliseconds and doubles with each retry.",
    model: models[2],
  },
] as const;

export function HomeDemo() {
  const [active, setActive] = useState(0);
  const { instruction, input, output, model } = examples[active];
  const prompt = JSON.stringify(instruction + "\n\n" + input).replaceAll("'", "'\\''");
  const lines = [
    `curl "${apiOrigin}${apiBasePath}/chat/completions" \\`,
    '  -H "Authorization: Bearer $SONNELY_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{",
    `    "model": "${model.id}",`,
    '    "messages": [{"role": "user",',
    `      "content": ${prompt}}]`,
    "  }'",
  ];

  return (
    <section className="home-quickstart" id="quickstart" aria-labelledby="home-quickstart-heading">
      <header className="home-quickstart-head">
        <div>
          <h2 id="home-quickstart-heading">Your first API request.</h2>
          <p>
            Set <code>SONNELY_API_KEY</code> in your terminal, then copy and run the request.
          </p>
        </div>
        <Link href="/docs#quickstart" className="text-link">
          Integration guide <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="home-api">
        <div className="home-api-toolbar">
          <p>
            <Terminal size={17} aria-hidden /> Chat Completions
          </p>
          <div className="home-api-examples" role="group" aria-label="Choose a sample task">
            {examples.map(({ label }, index) => (
              <button
                type="button"
                key={label}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="home-api-panes">
          <div className="home-api-request">
            <div className="home-api-pane-head">
              <h3>cURL request</h3>
              <CopyButton value={lines.join("\n")} label="Copy request" />
            </div>
            <pre>
              <code>
                {lines.map((line, index) => (
                  <span className="home-api-line" key={index}>
                    <span aria-hidden="true">{index + 1}</span>
                    <span>{line}</span>
                  </span>
                ))}
              </code>
            </pre>
          </div>
          <div className="home-api-response" aria-labelledby="home-api-response-title">
            <div className="home-api-pane-head">
              <h3 id="home-api-response-title">Sample response</h3>
            </div>
            <div className="home-api-result" aria-live="polite">
              <p className="home-api-model">
                <Cpu size={15} aria-hidden /> {model.name}
              </p>
              <p className={active === 1 ? "mono" : undefined}>{output}</p>
            </div>
            <Link
              className="text-link"
              href={"/console?model=" + encodeURIComponent(model.id)}
              aria-label={"Open " + model.name + " in playground"}
            >
              Open in playground <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </div>
      <p className="home-api-route">
        Sonnely meters the request. NEAR AI runs the model inside a Private TEE.{" "}
        <Link href="#request-path" className="text-link">
          Follow the request <ArrowUpRight size={14} />
        </Link>
      </p>
    </section>
  );
}
