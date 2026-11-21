"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { models } from "@/lib/models";
import { providerNames, routeLabels, type PrivacyRoute, type ProviderModel } from "@/lib/model-privacy";

const enabledIds = new Set<string>(models.map(({ id }) => id));
const count = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function NearModelDirectory({
  models: directory,
  privacyCheckedOn,
  snapshotDate,
}: {
  models: ProviderModel[];
  privacyCheckedOn: string;
  snapshotDate?: string;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<PrivacyRoute | "all">("all");
  const search = query.trim().toLowerCase();
  const visible = directory.filter((model) => {
    if (tier !== "all" && model.route !== tier) return false;
    return [
      model.name,
      model.id,
      providerNames[model.owner] ?? model.owner,
      ...model.outputs,
      routeLabels[model.route],
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  return (
    <section id="near-directory" className="near-directory" aria-labelledby="near-directory-heading">
      <header className="section-head">
        <div>
          <h2 id="near-directory-heading">NEAR AI model directory</h2>
          <p>
            Browse all {directory.length} models listed by NEAR AI. Only rows marked Available on Sonnely can
            run here.
          </p>
        </div>
        <a className="text-link" href="https://near.ai/models">
          NEAR catalog <ArrowUpRight size={16} />
        </a>
      </header>
      <dl className="near-route-guide">
        <div>
          <dt>Private TEE</dt>
          <dd>Confidential execution in a NEAR-hosted enclave.</dd>
        </div>
        <div>
          <dt>Private 3P TEE</dt>
          <dd>Confidential execution in a third-party attested enclave. Verification varies by provider.</dd>
        </div>
        <div>
          <dt>Incognito</dt>
          <dd>
            NEAR’s router shields account identity. The provider processes the request under its own data
            terms.
          </dd>
        </div>
      </dl>
      <p className="caption">Privacy tiers checked against NEAR’s published catalog on {privacyCheckedOn}.</p>
      <div className="catalog-tools">
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search NEAR directory"
            placeholder="Search NEAR directory"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="NEAR privacy tier"
          value={tier}
          onChange={(event) => setTier(event.target.value as typeof tier)}
        >
          <option value="all">All privacy tiers</option>
          {Object.entries(routeLabels)
            .filter(([route]) => directory.some((model) => model.route === route))
            .map(([route, label]) => (
              <option key={route} value={route}>
                {label}
              </option>
            ))}
        </select>
      </div>
      <p className="catalog-count caption" role="status">
        {visible.length} of {directory.length} models
        {snapshotDate ? " · Catalog snapshot " + snapshotDate : ""}
      </p>
      {visible.length ? (
        <div className="panel catalog-list">
          <table aria-label="NEAR AI directory" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Model
                </th>
                <th role="columnheader" scope="col">
                  Privacy tier
                </th>
                <th role="columnheader" scope="col">
                  Output
                </th>
                <th role="columnheader" scope="col">
                  Context
                </th>
                <th role="columnheader" scope="col">
                  Availability
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {visible.map((model) => (
                <tr key={model.id} role="row">
                  <th scope="row" role="rowheader">
                    <strong>{model.name}</strong>
                    <p className="caption near-model-id">{model.id}</p>
                    <span className="caption">{providerNames[model.owner] ?? model.owner}</span>
                  </th>
                  <td className="catalog-value" role="cell">
                    <span className="catalog-mobile-label" aria-hidden="true">
                      Privacy tier
                    </span>
                    <span className="model-tier">{routeLabels[model.route]}</span>
                  </td>
                  <td className="catalog-value" role="cell">
                    <span className="catalog-mobile-label" aria-hidden="true">
                      Output
                    </span>
                    <span>{model.outputs.join(", ") || "—"}</span>
                  </td>
                  <td className="catalog-value" role="cell">
                    <span className="catalog-mobile-label" aria-hidden="true">
                      Context
                    </span>
                    <span>{model.context ? count.format(model.context) : "—"}</span>
                  </td>
                  <td className="catalog-actions" role="cell">
                    <span className={enabledIds.has(model.id) ? "model-tier" : "caption"}>
                      {enabledIds.has(model.id) ? "Available on Sonnely" : "NEAR catalog only"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No provider models match these filters.</p>
      )}
    </section>
  );
}
