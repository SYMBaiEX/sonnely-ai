import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { models } from "@/lib/models";

export function HomeModelList() {
  return (
    <section className="section" aria-labelledby="home-models-heading">
      <div className="section-head">
        <div>
          <p className="eyebrow">From the catalog</p>
          <h2 id="home-models-heading">Choose your model.</h2>
        </div>
        <Link href="/models" className="text-link">
          Compare models <ArrowUpRight size={18} />
        </Link>
      </div>
      <ul className="panel home-model-list" role="list">
        {models.map((model) => (
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
              <span className="home-model-spec">
                <span className="pill">{model.type}</span>
                <span className="mono">{model.context} context</span>
              </span>
              <span className="text-link">
                Open in chat <ArrowUpRight size={16} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
