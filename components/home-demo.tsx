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

const languages = ["cURL", "Python", "JavaScript"] as const;
type Language = (typeof languages)[number];
const endpoint = apiOrigin + apiBasePath;

function requestCode(language: Language, model: string, content: string) {
  const modelId = JSON.stringify(model);
  const message = JSON.stringify(content);
  if (language === "Python")
    return [
      "import os",
      "from openai import OpenAI",
      "",
      `client = OpenAI(base_url="${endpoint}",`,
      '                api_key=os.environ["SONNELY_API_KEY"])',
      "reply = client.chat.completions.create(",
      `    model=${modelId},`,
      `    messages=[{"role": "user", "content": ${message}}],`,
      ")",
      "print(reply.choices[0].message.content)",
    ];
  if (language === "JavaScript")
    return [
      'import OpenAI from "openai";',
      "",
      "const client = new OpenAI({",
      `  baseURL: "${endpoint}",`,
      "  apiKey: process.env.SONNELY_API_KEY,",
      "});",
      "const reply = await client.chat.completions.create({",
      `  model: ${modelId},`,
      `  messages: [{ role: "user", content: ${message} }],`,
      "});",
      "console.log(reply.choices[0].message.content);",
    ];
  return [
    'curl "' + endpoint + '/chat/completions" ' + String.fromCharCode(92),
    '  -H "Authorization: Bearer $SONNELY_API_KEY" ' + String.fromCharCode(92),
    '  -H "Content-Type: application/json" ' + String.fromCharCode(92),
    "  -d '{",
    `    "model": ${modelId},`,
    '    "messages": [{"role": "user",',
    '      "content": ' + message.replaceAll("'", "'\\''") + "}]",
    "  }'",
  ];
}

export function HomeDemo() {
  const [active, setActive] = useState(0);
  const [language, setLanguage] = useState<Language>("cURL");
  const [showJson, setShowJson] = useState(false);
  const { instruction, input, output, model } = examples[active];
  const lines = requestCode(language, model.id, instruction + "\n\n" + input);
  const sampleResponse = {
    model: model.id,
    choices: [{ index: 0, message: { role: "assistant", content: output } }],
  };

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
              <div className="home-api-languages" role="group" aria-label="Request language">
                {languages.map((option) => (
                  <button
                    type="button"
                    key={option}
                    aria-pressed={language === option}
                    onClick={() => setLanguage(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <CopyButton key={language + active} value={lines.join("\n")} label="Copy request" />
            </div>
            <pre aria-label={language + " request"}>
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
              <button
                className="button quiet small"
                type="button"
                aria-pressed={showJson}
                onClick={() => setShowJson(!showJson)}
              >
                JSON
              </button>
            </div>
            <div className="home-api-result" aria-live="polite">
              <p className="home-api-model">
                <Cpu size={15} aria-hidden /> {model.name}
              </p>
              {showJson ? (
                <pre aria-label="Sample response JSON">
                  <code>{JSON.stringify(sampleResponse, null, 2)}</code>
                </pre>
              ) : (
                <p className={active === 1 ? "mono" : undefined}>{output}</p>
              )}
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
