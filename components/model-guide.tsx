import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { limits } from "@/lib/api-contract";
import { featuredModels } from "@/lib/models";

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
        {featuredModels.map((model) => (
          <div key={model.id}>
            <dt>{model.name}</dt>
            <dd>{workload[model.type]}</dd>
          </div>
        ))}
      </dl>
      <p>
        The context window describes the underlying model. Sonnely currently accepts up to{" "}
        {limits.bodyBytes.toLocaleString("en-US")} bytes per request and returns up to{" "}
        {limits.maxOutputTokens.toLocaleString("en-US")} output tokens.
      </p>
      <Link className="text-link" href="/docs/api#request-limits">
        See request limits <ArrowUpRight size={16} />
      </Link>
    </section>
  );
}
