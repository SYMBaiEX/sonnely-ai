"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { models } from "@/lib/models";
import { providerRoute, type ProviderId } from "@/lib/provider-catalog";

export function PlaygroundRoute({
  model,
  provider,
  availableProviders,
  disabled,
  onChange,
}: {
  model: string;
  provider: ProviderId;
  availableProviders: ProviderId[];
  disabled: boolean;
  onChange: (model: string, provider: ProviderId) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftModel, setDraftModel] = useState(model);
  const [draftProvider, setDraftProvider] = useState(provider);
  const current = models.find((item) => item.id === model) ?? models[0];
  const next = models.find((item) => item.id === draftModel) ?? models[0];
  const routes = availableProviders.filter((id) => providerRoute(next, id));
  const available = availableProviders.includes(provider) && Boolean(providerRoute(current, provider));

  function open() {
    setDraftModel(model);
    setDraftProvider(provider);
    dialog.current?.showModal();
  }

  function selectModel(model: (typeof models)[number]) {
    setDraftModel(model.id);
    const eligible = availableProviders.filter((id) => providerRoute(model, id));
    if (!eligible.includes(draftProvider)) setDraftProvider(eligible[0] ?? model.provider);
  }

  return (
    <>
      <button
        type="button"
        className="playground-route-trigger"
        aria-label={`Choose model. ${current.name}${available ? "" : " unavailable"}`}
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
            {current.type}
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
            {models.map((item) => (
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
          </fieldset>
        </div>
        <footer>
          <button className="button quiet" type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            className="button accent"
            type="button"
            disabled={disabled || !routes.includes(draftProvider)}
            onClick={() => {
              onChange(draftModel, draftProvider);
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
