"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { contextFormat } from "@/lib/model-catalog";
import { models } from "@/lib/models";
import { formatRate, markedUpRates } from "@/lib/pricing";
import {
  privateFailoverProviders,
  providerNames,
  providerRoute,
  type Model,
  type ProviderId,
} from "@/lib/provider-catalog";

function availableRoutes(model: Model, providers: readonly ProviderId[]) {
  return providers.flatMap((provider) => providerRoute(model, provider) ?? []);
}

export function PlaygroundRoute({
  model,
  provider,
  fallbacks,
  availableProviders,
  disabled,
  onChange,
}: {
  model: string;
  provider: ProviderId;
  fallbacks: readonly ProviderId[];
  availableProviders: ProviderId[];
  disabled: boolean;
  onChange: (model: string, provider: ProviderId, fallbacks: ProviderId[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftModel, setDraftModel] = useState(model);
  const [draftProvider, setDraftProvider] = useState(provider);
  const [draftFallbacks, setDraftFallbacks] = useState<ProviderId[]>([]);
  const [search, setSearch] = useState("");
  const current = models.find((item) => item.id === model) ?? models[0];
  const next = models.find((item) => item.id === draftModel) ?? models[0];
  const routes = availableRoutes(next, availableProviders);
  const selectedRoute = routes.find(({ provider }) => provider === draftProvider);
  const eligible = privateFailoverProviders(next, availableProviders);
  const fallbackOptions = eligible.includes(draftProvider)
    ? eligible.filter((id) => id !== draftProvider)
    : [];
  const searchQuery = search.trim().toLowerCase();
  const matches = models.filter((item) =>
    `${item.name} ${item.id} ${item.type}`.toLowerCase().includes(searchQuery),
  );
  const available = availableProviders.includes(provider) && Boolean(providerRoute(current, provider));

  function open() {
    setDraftModel(model);
    setDraftProvider(provider);
    setDraftFallbacks(fallbacks.filter((id) => id !== provider));
    setSearch("");
    dialog.current?.showModal();
  }

  function selectModel(model: Model) {
    setDraftModel(model.id);
    setDraftFallbacks([]);
    const eligible = availableRoutes(model, availableProviders);
    if (!eligible.some(({ provider }) => provider === draftProvider)) {
      setDraftProvider(eligible[0]?.provider ?? model.provider);
    }
  }

  return (
    <>
      <button
        type="button"
        className="playground-route-trigger"
        aria-description="Choose model and provider."
        aria-haspopup="dialog"
        onClick={open}
        disabled={disabled}
      >
        <span className="playground-model-mark" aria-hidden="true">
          {current.mark}
        </span>
        <span className="playground-route-label">
          <strong>{current.name}</strong>
          <small>
            {providerNames[provider]} · {current.type}
            {fallbacks.length > 0 ? " · Failover enabled" : ""}
            {available ? "" : " · unavailable"}
          </small>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <dialog ref={dialog} className="playground-route-dialog panel" aria-labelledby="playground-route-title">
        <header>
          <h2 id="playground-route-title">Choose a model</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close model picker"
            onClick={() => dialog.current?.close()}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="playground-route-body">
          <fieldset className="playground-model-options">
            <legend>Model</legend>
            <label className="playground-model-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a model"
                aria-label="Find a model"
              />
            </label>
            <div className="playground-model-results">
              {matches.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="playground-model"
                    checked={draftModel === item.id}
                    onChange={() => selectModel(item)}
                  />
                  <span className="playground-model-mark" aria-hidden="true">
                    {item.mark}
                  </span>
                  <span className="playground-route-label">
                    <strong>{item.name}</strong>
                    <small>
                      {item.type} · {item.context} context
                    </small>
                  </span>
                  <Check size={17} className="playground-route-check" aria-hidden="true" />
                </label>
              ))}
              {matches.length === 0 && (
                <p className="caption" role="status">
                  No models match your search.
                </p>
              )}
            </div>
          </fieldset>
          <fieldset className="playground-providers">
            <legend>Provider</legend>
            <p className="caption">{next.name}</p>
            {routes.length ? (
              <>
                <p className="caption">USD per million tokens</p>
                <div>
                  {routes.map((route) => {
                    const rates = markedUpRates(route);
                    return (
                      <label key={route.provider}>
                        <input
                          type="radio"
                          name="playground-provider"
                          checked={draftProvider === route.provider}
                          onChange={() => {
                            setDraftProvider(route.provider);
                            setDraftFallbacks([]);
                          }}
                        />
                        <span className="playground-route-label">
                          <strong>{providerNames[route.provider]}</strong>
                          {route.context !== null && (
                            <small>{contextFormat.format(route.context)} context tokens</small>
                          )}
                          <small>
                            {formatRate(rates.input)} input · {formatRate(rates.output)} output
                            {rates.cache !== rates.input && " · " + formatRate(rates.cache) + " cached input"}
                          </small>
                        </span>
                        <Check size={17} className="playground-route-check" aria-hidden="true" />
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="caption" role="status">
                This model has no available providers.
              </p>
            )}
            {fallbackOptions.length > 0 && (
              <div className="playground-fallback-pickers">
                <div className="playground-fallback-field">
                  <label htmlFor="playground-first-fallback">First fallback</label>
                  <select
                    id="playground-first-fallback"
                    value={draftFallbacks[0] ?? ""}
                    onChange={(event) => {
                      const selected = fallbackOptions.find((id) => id === event.target.value);
                      setDraftFallbacks(selected ? [selected] : []);
                    }}
                  >
                    <option value="">None</option>
                    {fallbackOptions.map((id) => (
                      <option value={id} key={id}>
                        {providerNames[id]}
                      </option>
                    ))}
                  </select>
                </div>
                {draftFallbacks[0] && fallbackOptions.length > 1 && (
                  <div className="playground-fallback-field">
                    <label htmlFor="playground-second-fallback">Second fallback</label>
                    <select
                      id="playground-second-fallback"
                      value={draftFallbacks[1] ?? ""}
                      onChange={(event) => {
                        const first = draftFallbacks[0];
                        const selected = fallbackOptions.find(
                          (id) => id === event.target.value && id !== first,
                        );
                        setDraftFallbacks(selected ? [first, selected] : [first]);
                      }}
                    >
                      <option value="">None</option>
                      {fallbackOptions
                        .filter((id) => id !== draftFallbacks[0])
                        .map((id) => (
                          <option value={id} key={id}>
                            {providerNames[id]}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <p className="caption">
                  Fallbacks are tried in order when a route is at capacity or explicitly rate-limits the
                  request.
                </p>
              </div>
            )}
          </fieldset>
        </div>
        <footer>
          <button className="button quiet" type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            className="button accent"
            type="button"
            disabled={disabled || !selectedRoute}
            onClick={() => {
              if (!selectedRoute) return;
              onChange(
                draftModel,
                selectedRoute.provider,
                draftFallbacks.filter((id) => fallbackOptions.includes(id)),
              );
              dialog.current?.close();
            }}
          >
            Use model
          </button>
        </footer>
      </dialog>
    </>
  );
}
