"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Calculator } from "lucide-react";
import { limits } from "@/lib/api-contract";
import { creditBalance } from "@/lib/credit-amount";
import { models } from "@/lib/models";
import { formatRate, markedUpRates, requestCharge } from "@/lib/pricing";

function tokens(value: string, maximum: number) {
  const count = Number(value);
  return value !== "" && Number.isSafeInteger(count) && count >= 0 && count <= maximum ? count : null;
}

export function CostExample() {
  const [modelId, setModelId] = useState<string>(models[0].id);
  const [input, setInput] = useState("10000");
  const [output, setOutput] = useState("1000");
  const model = models.find(({ id }) => id === modelId) ?? models[0];
  const rates = markedUpRates(model);
  const inputTokens = tokens(input, limits.bodyBytes);
  const outputTokens = tokens(output, limits.maxOutputTokens);
  const estimate =
    inputTokens === null || outputTokens === null ? null : requestCharge(model, inputTokens, 0, outputTokens);

  return (
    <section className="panel estimate" aria-labelledby="cost-example-heading">
      <header>
        <span className="estimate-icon">
          <Calculator size={21} aria-hidden="true" />
        </span>
        <div>
          <h2 id="cost-example-heading">Estimate a request</h2>
          <p>Compare uncached text requests at Sonnely’s published token rates.</p>
        </div>
      </header>
      <div className="estimate-inputs">
        <label>
          Model
          <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
            {models.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Input tokens
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={limits.bodyBytes}
            step={1}
            aria-invalid={inputTokens === null}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <label>
          Output tokens
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={limits.maxOutputTokens}
            step={1}
            aria-invalid={outputTokens === null}
            value={output}
            onChange={(event) => setOutput(event.target.value)}
          />
        </label>
      </div>
      <div className="estimate-summary">
        <p>Estimated charge</p>
        <output aria-live="polite">
          {estimate === null ? "Check token counts" : creditBalance(estimate)}
        </output>
        <dl aria-label="Rates per million tokens">
          <div>
            <dt>Input / 1M tokens</dt>
            <dd>{formatRate(rates.input)}</dd>
          </div>
          <div>
            <dt>Output / 1M tokens</dt>
            <dd>{formatRate(rates.output)}</dd>
          </div>
        </dl>
      </div>
      <footer>
        <p>Actual charges use reported usage and account for cached input.</p>
        <Link className="text-link" href="/models#model-rates">
          Compare model rates <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}
