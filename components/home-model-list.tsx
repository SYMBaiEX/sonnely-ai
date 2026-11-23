import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { routeLabels } from "@/lib/model-privacy";
import { models } from "@/lib/models";
import { formatRate, markedUpRates } from "@/lib/pricing";

export function HomeModelList() {
  return (
    <section className="section home-models" aria-labelledby="home-models-heading">
      <div className="section-head">
        <h2 id="home-models-heading">Choose your model.</h2>
        <Link href="/models#available-models" className="text-link">
          Compare models and pricing <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="home-model-catalog" data-reveal="fade">
        <div className="home-model-columns" aria-hidden="true">
          <span>Model</span>
          <span>Privacy route</span>
          <span>Context window</span>
          <span>Input / output per 1M tokens</span>
        </div>
        <ul className="home-model-list" role="list">
          {models.map((model) => {
            const rates = markedUpRates(model);
            return (
              <li key={model.id}>
                <Link href={"/console?model=" + encodeURIComponent(model.id)} className="home-model-row">
                  <div className="catalog-identity">
                    <span className={"model-mark " + model.color} aria-hidden="true">
                      {model.mark}
                    </span>
                    <div>
                      <h3>{model.name}</h3>
                      <p>{model.summary}</p>
                    </div>
                  </div>
                  <span className="home-model-route">{routeLabels[model.privacyRoute]}</span>
                  <span className="home-model-context">
                    {model.context} <span>tokens</span>
                  </span>
                  <span className="home-model-rates">
                    {formatRate(rates.input)} <span>/</span> {formatRate(rates.output)}
                    <small>input / output per 1M</small>
                  </span>
                  <span className="home-model-action">
                    Try <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
