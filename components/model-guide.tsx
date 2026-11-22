import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { limits } from "@/lib/api-contract";
import { requestCharge } from "@/lib/pricing";
import { models } from "@/lib/models";

const workload = {
  General: "Summarize notes or synthesize findings across several short excerpts.",
  Fast: "Extract fields, tag documents, or classify brief requests.",
  Coding: "Explain a function, review a short diff, or draft structured text for a developer workflow.",
  Reasoning: "Compare alternatives, work through a multi-step problem, or analyze a long document.",
} as const;

export function ModelGuide() {
  return (
    <section className="content-section" aria-labelledby="compare-models-heading">
      <h2 id="compare-models-heading">Compare models by workload</h2>
      <p>
        All models accept and return text through Sonnely. Start with one representative prompt and compare
        the output before committing a budget.
      </p>
      <dl className="reference-list">
        {models.map((model) => (
          <div key={model.id}>
            <dt>{model.name}</dt>
            <dd>{workload[model.type]}</dd>
          </div>
        ))}
      </dl>
      <p>
        The provider context window describes the underlying model. Sonnely currently accepts up to{" "}
        {limits.bodyBytes.toLocaleString("en-US")} bytes per request and returns up to{" "}
        {limits.maxOutputTokens.toLocaleString("en-US")} output tokens.
      </p>
      <Link className="text-link" href="/docs/api#request-limits">
        See request limits <ArrowUpRight size={16} />
      </Link>
    </section>
  );
}

export function CostExample() {
  const model = models[0];
  const input = 10_000;
  const output = 1_000;
  const estimated = (requestCharge(model, input, 0, output) / 1_000_000).toFixed(4);
  return (
    <section className="content-section panel cost-example" aria-labelledby="cost-example-heading">
      <h2 id="cost-example-heading">Estimate a request</h2>
      <p>{model.name} · Example request</p>
      <dl className="cost-example-breakdown">
        <div>
          <dt>Uncached input tokens</dt>
          <dd>{input.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Output tokens</dt>
          <dd>{output.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Estimated charge</dt>
          <dd>${estimated}</dd>
        </div>
      </dl>
      <p>
        Final charges use provider-reported token counts. Cache pricing applies to the input tokens the
        provider reports as cached. Sonnely temporarily reserves an estimated maximum from your balance and
        key budget before the request runs.
      </p>
      <Link className="text-link" href="/models#model-rates">
        Compare current rates <ArrowUpRight size={16} />
      </Link>
    </section>
  );
}
