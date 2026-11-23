"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
const completionPath = apiBasePath + "/chat/completions";
const codeToken = /("(?:\\.|[^"\\])*"|\b(?:curl|import|from|const|new|await)\b|-(?:H|d)(?=\s))/g;

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
    'curl "' + apiOrigin + completionPath + '" ' + String.fromCharCode(92),
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
      <div className="home-quickstart-intro">
        <h2 id="home-quickstart-heading">Your first API request.</h2>
        <p>
          <Link href="/console/keys">Create an API key</Link> and export it as <code>SONNELY_API_KEY</code>.
          Pick a language, then copy the example into your terminal or app.
        </p>
        <div className="home-quickstart-links">
          <Link href="/docs/quickstart" className="text-link">
            Read the quickstart <ArrowRight size={16} aria-hidden />
          </Link>
          <Link href="/docs/sdks" className="text-link">
            SDKs <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
        <div className="home-api-samples">
          <p id="home-api-example-label">Example</p>
          <div
            className="home-api-segments"
            role="group"
            aria-labelledby="home-api-example-label"
            style={{ "--segment": active } as CSSProperties}
          >
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
      </div>
      <div className="home-api" data-reveal="fade">
        <div className="home-api-endpoint">
          <span className="home-api-method">POST</span>
          <code>{completionPath}</code>
        </div>
        <div className="home-api-panes">
          <div className="home-api-request">
            <div className="home-api-pane-head">
              <div
                className="home-api-segments"
                role="group"
                aria-label="Request language"
                style={{ "--segment": languages.indexOf(language) } as CSSProperties}
              >
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
            <pre className="home-api-code" aria-label={language + " request"}>
              <code>
                {lines.map((line, index) => (
                  <span className="home-api-line" key={index}>
                    <span aria-hidden="true">{index + 1}</span>
                    <span>
                      {line.split(codeToken).map((token, index) =>
                        index % 2 === 0 ? (
                          token
                        ) : (
                          <span
                            className={token.startsWith('"') ? "home-api-string" : "home-api-keyword"}
                            key={index}
                          >
                            {token}
                          </span>
                        ),
                      )}
                    </span>
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
              {showJson ? (
                <pre key={active} aria-label="Sample response JSON">
                  <code>{JSON.stringify(sampleResponse, null, 2)}</code>
                </pre>
              ) : (
                <p key={active} className={active === 1 ? "mono" : undefined}>
                  {output}
                </p>
              )}
            </div>
            <div className="home-api-response-footer">
              <span>{model.name}</span>
              <Link
                className="text-link"
                href={"/console?model=" + encodeURIComponent(model.id)}
                aria-label={"Open " + model.name + " in playground"}
              >
                Open in playground <ArrowUpRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
