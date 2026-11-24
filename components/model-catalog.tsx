"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { apiBasePath } from "@/lib/api-contract";
import {
  contextFormat,
  endpointDocs,
  modelCatalogEntries,
  modelDetailHref,
  modelPlaygroundHref,
  rateLabels,
  workloadNames,
  type ModelCatalogEndpoint,
  type ModelCatalogRates,
} from "@/lib/model-catalog";
import { routeLabels } from "@/lib/model-privacy";
import { formatRate, markupPercent } from "@/lib/pricing";
import { providerIds, providerNames, type ProviderId } from "@/lib/provider-models";
import { CopyButton } from "./shared";

const upstreamWorkloads: Partial<Record<string, readonly ModelCatalogEndpoint[]>> = {
  text: ["chat/completions"],
  embedding: ["embeddings"],
  reranking: ["rerank"],
  decisions: ["systemone"],
  image: ["images/generations", "images/edits"],
  transcription: ["audio/transcriptions"],
};
function RateList({ rates }: { rates: ModelCatalogRates }) {
  return (
    <ul className="catalog-rates" role="list">
      {rateLabels.map(([key, label]) =>
        rates[key] === undefined ? null : (
          <li key={key}>
            <strong>{formatRate(rates[key])}</strong> {label}
          </li>
        ),
      )}
    </ul>
  );
}

export function ModelCatalog({ availableProviders }: { availableProviders: readonly ProviderId[] }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("default");
  const [provider, setProvider] = useState("all");
  const [workload, setWorkload] = useState("all");
  const [availability, setAvailability] = useState("all");
  const query = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const displayed = modelCatalogEntries.flatMap((model) => {
    const available = model.routes.length > 0 && availableProviders.includes(model.provider);
    if (provider !== "all" && provider !== model.provider) return [];
    if (availability === "available" && !available) return [];
    if (availability === "catalog" && model.routes.length > 0) return [];

    const routes =
      workload === "all" ? model.routes : model.routes.filter((route) => route.endpoint === workload);
    const upstream = model.workload.split(",").map((item) => item.trim().replace(/^\//, ""));
    if (
      workload !== "all" &&
      !routes.length &&
      (model.routes.length ||
        !upstream.some(
          (name) => name === workload || upstreamWorkloads[name]?.some((endpoint) => endpoint === workload),
        ))
    )
      return [];

    const searchable = [
      model.name,
      model.upstreamId,
      providerNames[model.provider],
      model.provider,
      routeLabels[model.privacyRoute],
      model.workload,
      model.summary,
      ...model.routes.flatMap((route) => [route.modelId, route.endpoint, workloadNames[route.endpoint]]),
    ]
      .join(" ")
      .toLowerCase();
    return query.every((term) => searchable.includes(term)) ? [{ model, routes, available, upstream }] : [];
  });

  if (sort === "input" || sort === "output") {
    const price = (entry: (typeof displayed)[number]) =>
      Math.min(...entry.routes.map((route) => route.rates[sort] ?? Infinity));
    displayed.sort((a, b) => price(a) - price(b));
  } else if (sort === "name") {
    displayed.sort((a, b) => a.model.name.localeCompare(b.model.name));
  } else {
    displayed.sort((a, b) => Number(b.available) - Number(a.available));
  }

  return (
    <>
      <div className="catalog-tools">
        <label className="search catalog-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a model"
            aria-label="Find a model"
          />
        </label>
        <label className="catalog-filter">
          <span>Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="all">All providers</option>
            {providerIds.map((id) => (
              <option key={id} value={id}>
                {providerNames[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="catalog-filter">
          <span>Workload</span>
          <select value={workload} onChange={(event) => setWorkload(event.target.value)}>
            <option value="all">All workloads</option>
            {Object.entries(workloadNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="catalog-filter">
          <span>Availability</span>
          <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="all">All models</option>
            <option value="available">Available on Sonnely</option>
            <option value="catalog">Provider catalog only</option>
          </select>
        </label>
        <label className="catalog-filter">
          <span>Sort models</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="default">Available first</option>
            <option value="name">Model name</option>
            <option value="input">Lowest input token rate</option>
            <option value="output">Lowest output token rate</option>
          </select>
        </label>
      </div>
      <p className="catalog-count caption" role="status">
        {displayed.length === 0
          ? "No models match your filters."
          : `${displayed.length} provider ${displayed.length === 1 ? "entry" : "entries"}`}
      </p>
      {displayed.length > 0 && (
        <div className="panel catalog-list" id="model-rates">
          <table aria-label="Model rates and context" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col">Model</th>
                <th scope="col">Context</th>
                <th scope="col">Endpoints and rates</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {displayed.map(({ model, routes, available, upstream }) => {
                const id = routes[0]?.modelId ?? model.upstreamId;
                const chat = available && routes.find((route) => route.endpoint === "chat/completions");
                return (
                  <tr
                    role="row"
                    key={model.provider + "/" + model.upstreamId}
                    data-provider={model.provider}
                    data-upstream-model={model.upstreamId}
                  >
                    <th scope="row">
                      <div className="catalog-identity">
                        <span aria-hidden="true" className={"model-mark " + (model.color ?? "smoke")}>
                          {model.mark ?? (model.name.match(/[a-z0-9]/i)?.[0].toUpperCase() || "•")}
                        </span>
                        <div>
                          <h3>
                            <Link href={modelDetailHref(model)} prefetch={false}>
                              {model.name}
                            </Link>
                          </h3>
                          <span className="model-tier">
                            {providerNames[model.provider]} · {routeLabels[model.privacyRoute]}
                          </span>
                          <code className="catalog-model-id">{id}</code>
                        </div>
                      </div>
                    </th>
                    <td className="catalog-value">
                      <span className="catalog-mobile-label" aria-hidden="true">
                        Context
                      </span>
                      {model.context ? `${contextFormat.format(model.context)} tokens` : "—"}
                    </td>
                    <td className="catalog-workloads">
                      {routes.length ? (
                        <>
                          {!available && <p className="caption catalog-availability">Unavailable</p>}
                          <ul className="catalog-endpoints" role="list">
                            {routes.map((route) => (
                              <li
                                key={route.endpoint}
                                data-endpoint={route.endpoint}
                                data-model-id={route.modelId}
                              >
                                <Link
                                  href={endpointDocs(route.endpoint)}
                                  className="text-link"
                                  aria-label={`/${route.endpoint} · ${workloadNames[route.endpoint]} guide`}
                                >
                                  <code>/{route.endpoint}</code>
                                </Link>
                                {route.modelId !== id && (
                                  <code className="catalog-model-id">{route.modelId}</code>
                                )}
                                <RateList rates={route.rates} />
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          <span className="catalog-availability catalog-provider-only">
                            Provider catalog only
                          </span>
                          <span className="caption catalog-upstream-workload">
                            {upstream
                              .map(
                                (name) =>
                                  workloadNames[name as ModelCatalogEndpoint] ??
                                  (name === "text" ? "Text" : name),
                              )
                              .join(", ")}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="catalog-actions">
                      <div className="catalog-row-actions">
                        {chat && (
                          <Link
                            href={modelPlaygroundHref(chat.modelId, model.provider)}
                            className="text-link"
                          >
                            Open in chat <ArrowUpRight size={15} aria-hidden="true" />
                          </Link>
                        )}
                        <CopyButton
                          value={id}
                          label={`Copy ID for ${model.name} on ${providerNames[model.provider]}`}
                          text="Copy ID"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="caption catalog-note">
        Sonnely rates include a {markupPercent}% markup.{" "}
        <Link href="/docs/providers#compare-prices">How pricing works</Link>
        {" · "}
        <Link href={apiBasePath + "/provider-models"}>Catalog JSON</Link>
      </p>
    </>
  );
}
