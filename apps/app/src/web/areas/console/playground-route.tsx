import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button, cn, Dialog, DialogContent, DialogTitle, Label } from "@repo/ui";
import { SearchField } from "../../search.tsx";
import {
  contextFormat,
  formatRate,
  models,
  privateFailoverProviders,
  providerNames,
  providerRoute,
  type ChatModel,
  type ProviderId,
} from "./playground-data.ts";

function availableRoutes(model: ChatModel, providers: readonly ProviderId[]) {
  return providers.flatMap((provider) => providerRoute(model, provider) ?? []);
}

function ModelMark({ children }: { children: string }) {
  return (
    <span data-playground-model-mark className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-meta font-strong text-primary" aria-hidden="true">
      {children}
    </span>
  );
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-ui text-foreground";

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
  const [open, setOpen] = useState(false);
  const [draftModel, setDraftModel] = useState(model);
  const [draftProvider, setDraftProvider] = useState(provider);
  const [draftFallbacks, setDraftFallbacks] = useState<ProviderId[]>([]);
  const [search, setSearch] = useState("");
  const current = models.find((item) => item.id === model) ?? models[0];
  const next = models.find((item) => item.id === draftModel) ?? models[0];
  const routes = availableRoutes(next, availableProviders);
  const selectedRoute = routes.find(({ provider }) => provider === draftProvider);
  const eligible = privateFailoverProviders(next, availableProviders);
  const fallbackOptions = eligible.includes(draftProvider) ? eligible.filter((id) => id !== draftProvider) : [];
  const searchQuery = search.trim().toLowerCase();
  const matches = models.filter((item) => `${item.name} ${item.id} ${item.type}`.toLowerCase().includes(searchQuery));
  const available = availableProviders.includes(provider) && Boolean(providerRoute(current, provider));

  function openPicker() {
    setDraftModel(model);
    setDraftProvider(provider);
    setDraftFallbacks(fallbacks.filter((id) => id !== provider));
    setSearch("");
    setOpen(true);
  }

  function selectModel(choice: ChatModel) {
    setDraftModel(choice.id);
    setDraftFallbacks([]);
    const eligibleRoutes = availableRoutes(choice, availableProviders);
    if (!eligibleRoutes.some(({ provider }) => provider === draftProvider)) {
      setDraftProvider(eligibleRoutes[0]?.provider ?? choice.routes[0]?.provider ?? "near-ai");
    }
  }

  const choiceClass = (selected: boolean) =>
    cn(
      "h-auto w-full justify-start gap-3 rounded-lg border px-3 py-2 text-left whitespace-normal",
      selected ? "border-border bg-accent hover:bg-accent" : "border-transparent hover:bg-accent/70",
    );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        data-playground-route-trigger
        aria-description="Choose model and provider."
        aria-haspopup="dialog"
        onClick={openPicker}
        disabled={disabled}
        className="h-auto max-w-full justify-start gap-2 rounded-lg px-2 py-1.5 text-left whitespace-normal"
      >
        <ModelMark>{current.mark}</ModelMark>
        <span data-playground-route-label className="grid min-w-0 flex-1 gap-0.5">
          <strong className="truncate text-ui font-strong">{current.name}</strong>
          <small className="truncate text-micro text-muted-foreground">
            {providerNames[provider]} · {current.type}
            {fallbacks.length > 0 ? " · Failover enabled" : ""}
            {available ? "" : " · unavailable"}
          </small>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-playground-route-dialog className="max-h-[calc(100dvh-2rem)] max-w-3xl gap-0 overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <DialogTitle>Choose a model</DialogTitle>
          </div>
          <div data-playground-route-body className="grid max-h-[calc(100dvh-10rem)] overflow-y-auto md:grid-cols-2">
            <section className="grid content-start gap-3 border-b border-border p-4 md:border-r md:border-b-0" aria-labelledby="playground-model-options">
              <h3 id="playground-model-options" className="text-meta font-medium text-muted-foreground">
                Model
              </h3>
              <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a model" aria-label="Find a model" />
              <div data-playground-model-results className="grid max-h-48 gap-1 overflow-y-auto md:max-h-[min(45dvh,25rem)]">
                {matches.map((item) => {
                  const selected = draftModel === item.id;
                  return (
                    <Button type="button" variant="ghost" key={item.id} aria-pressed={selected} onClick={() => selectModel(item)} className={choiceClass(selected)}>
                      <ModelMark>{item.mark}</ModelMark>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <strong className="truncate text-ui font-strong">{item.name}</strong>
                        <small className="truncate text-micro text-muted-foreground">
                          {item.type} · {contextFormat.format(item.context)} context
                        </small>
                      </span>
                      {selected && <Check size={17} className="text-primary" aria-hidden="true" />}
                    </Button>
                  );
                })}
                {matches.length === 0 && (
                  <p className="px-2 py-3 text-meta text-muted-foreground" role="status">
                    No models match your search.
                  </p>
                )}
              </div>
            </section>
            <section data-playground-providers className="grid content-start gap-3 p-4" aria-labelledby="playground-provider-options">
              <h3 id="playground-provider-options" className="text-meta font-medium text-muted-foreground">
                Provider
              </h3>
              <p className="text-ui text-foreground">{next.name}</p>
              {routes.length ? (
                <>
                  <p className="text-meta text-muted-foreground">USD per million tokens</p>
                  <div className="grid gap-1">
                    {routes.map((route) => {
                      const selected = draftProvider === route.provider;
                      return (
                        <Button
                          type="button"
                          variant="ghost"
                          key={route.provider}
                          aria-pressed={selected}
                          onClick={() => {
                            setDraftProvider(route.provider);
                            setDraftFallbacks([]);
                          }}
                          className={choiceClass(selected)}
                        >
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <strong className="truncate text-ui font-strong">{providerNames[route.provider]}</strong>
                            {route.context !== 0 && <small className="text-micro text-muted-foreground">{contextFormat.format(route.context)} context tokens</small>}
                            <small className="text-micro text-muted-foreground">
                              {formatRate(route.input)} input · {formatRate(route.output)} output
                              {route.cache !== route.input && " · " + formatRate(route.cache) + " cached input"}
                            </small>
                          </span>
                          {selected && <Check size={17} className="text-primary" aria-hidden="true" />}
                        </Button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-meta text-muted-foreground" role="status">
                  This model has no available providers.
                </p>
              )}
              {fallbackOptions.length > 0 && (
                <div className="grid gap-3 pt-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="playground-first-fallback">First fallback</Label>
                    <select
                      id="playground-first-fallback"
                      className={selectClass}
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
                    <div className="grid gap-1.5">
                      <Label htmlFor="playground-second-fallback">Second fallback</Label>
                      <select
                        id="playground-second-fallback"
                        className={selectClass}
                        value={draftFallbacks[1] ?? ""}
                        onChange={(event) => {
                          const first = draftFallbacks[0];
                          const selected = fallbackOptions.find((id) => id === event.target.value && id !== first);
                          setDraftFallbacks(selected && first ? [first, selected] : first ? [first] : []);
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
                  <p className="text-meta text-muted-foreground">Fallbacks are tried in order when a route is at capacity or explicitly rate-limits the request.</p>
                </div>
              )}
            </section>
          </div>
          <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={disabled || !selectedRoute}
              onClick={() => {
                if (!selectedRoute) return;
                onChange(draftModel, selectedRoute.provider, draftFallbacks.filter((id) => fallbackOptions.includes(id)));
                setOpen(false);
              }}
            >
              Use model
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
