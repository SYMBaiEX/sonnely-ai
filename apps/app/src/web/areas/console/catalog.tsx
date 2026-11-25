// spec/app/console/catalog.md: the model browser — the providers' inventories with Sonnely's routed endpoints and
// marked-up rates, filtered and sorted as the legacy catalog filters them.
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { CatalogModel, ModelRoute } from "../../../../gen/app__console__catalog.ts";
import { catalog } from "../../../../gen/app__console__catalog.ts";
import { Button, Input, cn } from "@repo/ui";
import { CopyButton, formatRate } from "./bits.tsx";

/** The display names the console gives the providers. */
const providerNames: Record<string, string> = {
  "near-ai": "NEAR AI",
  phala: "Phala",
  tinfoil: "Tinfoil",
};
const providerIds = ["near-ai", "phala", "tinfoil"] as const;

/** The display names of the endpoints Sonnely routes, verbatim from the legacy catalog. */
const workloadNames: Record<string, string> = {
  "chat/completions": "Chat Completions",
  responses: "Responses",
  embeddings: "Embeddings",
  rerank: "Reranking",
  systemone: "System One decisions",
  "images/generations": "Image generation",
  "images/edits": "Image editing",
  "audio/transcriptions": "Audio transcription",
  realtime: "Realtime transcription",
  "audio/translations": "Audio translation",
  "audio/speech": "Speech synthesis",
  "convert/file": "Document conversion",
  redact: "Redaction",
};

/** The privacy route labels. */
const routeLabels: Record<string, string> = {
  "private-tee": "Private TEE",
  "private-3p-tee": "Private 3P TEE",
  incognito: "Incognito",
  unclassified: "Unclassified",
};

/** Each rate unit and how the catalog names it. A rate of -1 is not billed that way. */
const rateLabels = [
  ["input", "input / 1M tokens"],
  ["cache", "cached input / 1M tokens"],
  ["output", "output / 1M tokens"],
  ["request", "per request"],
  ["session", "per session"],
] as const;

const contextFormat = new Intl.NumberFormat("en");

/** Where an endpoint's docs live. */
function endpointDocs(endpoint: string) {
  if (endpoint === "chat/completions") return "/docs/api#create-a-completion";
  if (["realtime", "audio/translations", "convert/file", "redact", "responses"].includes(endpoint))
    return "/docs/providers#additional-tinfoil-endpoints";
  return "/docs/providers#embeddings-decisions-images-and-audio";
}


/** Upstream workload names that also speak for a Sonnely workload a model is not routed on. */
const upstreamWorkloads: Record<string, readonly string[]> = {
  text: ["chat/completions"],
  embedding: ["embeddings"],
  reranking: ["rerank"],
  decisions: ["systemone"],
  image: ["images/generations", "images/edits"],
  transcription: ["audio/transcriptions"],
};

function RateList({ route }: { route: ModelRoute }) {
  return (
    <ul className="flex flex-wrap gap-x-3 text-xs text-muted-foreground" role="list">
      {rateLabels.map(([key, label]) =>
        route[key] < 0 ? null : (
          <li key={key}>
            <strong className="text-foreground">{formatRate(route[key])}</strong> {label}
          </li>
        ),
      )}
    </ul>
  );
}

export function CatalogSection() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("default");
  const [provider, setProvider] = useState("all");
  const [workload, setWorkload] = useState("all");
  const [availability, setAvailability] = useState("all");
  const query = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const displayed = catalog.flatMap((model) => {
    const available = model.routes.length > 0;
    if (provider !== "all" && provider !== model.provider) return [];
    if (availability === "available" && !available) return [];
    if (availability === "catalog" && model.routes.length > 0) return [];

    const routes = workload === "all" ? model.routes : model.routes.filter((route) => route.endpoint === workload);
    const upstream = model.workload.split(",").map((item) => item.trim().replace(/^\//, ""));
    if (
      workload !== "all" &&
      !routes.length &&
      (model.routes.length ||
        !upstream.some((name) => name === workload || upstreamWorkloads[name]?.some((endpoint) => endpoint === workload)))
    )
      return [];

    const searchable = [
      model.name,
      model.upstreamId,
      providerNames[model.provider],
      model.provider,
      routeLabels[model.route],
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
      Math.min(...entry.routes.map((route) => (route[sort] >= 0 ? route[sort] : Infinity)));
    displayed.sort((a, b) => price(a) - price(b));
  } else if (sort === "name") {
    displayed.sort((a, b) => a.model.name.localeCompare(b.model.name));
  } else {
    displayed.sort((a, b) => Number(b.available) - Number(a.available));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <Search size={15} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a model"
            aria-label="Find a model"
            className="pl-9"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Provider</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="all">All providers</option>
            {providerIds.map((id) => (
              <option key={id} value={id}>
                {providerNames[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Workload</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={workload}
            onChange={(event) => setWorkload(event.target.value)}
          >
            <option value="all">All workloads</option>
            {Object.entries(workloadNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Availability</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="all">All models</option>
            <option value="available">Available on Sonnely</option>
            <option value="catalog">Provider catalog only</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort models</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="default">Available first</option>
            <option value="name">Model name</option>
            <option value="input">Lowest input token rate</option>
            <option value="output">Lowest output token rate</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {displayed.length === 0
          ? "No models match your filters."
          : `${displayed.length} provider ${displayed.length === 1 ? "entry" : "entries"}`}
      </p>
      {displayed.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border" id="model-rates">
          <table aria-label="Model rates and context" className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="p-3 font-medium">Model</th>
                <th scope="col" className="p-3 font-medium">Context</th>
                <th scope="col" className="p-3 font-medium">Endpoints and rates</th>
                <th scope="col" className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(({ model, routes, available, upstream }) => {
                const id = routes[0]?.modelId ?? model.upstreamId;
                const chat = available && routes.find((route) => route.endpoint === "chat/completions");
                return (
                  <tr
                    key={model.provider + "/" + model.upstreamId}
                    data-provider={model.provider}
                    data-upstream-model={model.upstreamId}
                    className="border-b border-border last:border-0"
                  >
                    <th scope="row" className="p-3 text-left align-top font-normal">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs font-semibold text-muted-foreground"
                        >
                          {model.mark}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium">{model.name}</h3>
                          <span className="text-xs text-muted-foreground">
                            {providerNames[model.provider]} · {routeLabels[model.route] ?? model.route}
                          </span>
                          <code className="block truncate font-mono text-xs text-muted-foreground">{id}</code>
                        </div>
                      </div>
                    </th>
                    <td className="p-3 align-top whitespace-nowrap">
                      {model.context ? `${contextFormat.format(model.context)} tokens` : "—"}
                    </td>
                    <td className="p-3 align-top">
                      {routes.length ? (
                        <>
                          {!available && <p className="text-xs text-muted-foreground">Unavailable</p>}
                          <ul className="flex flex-col gap-2" role="list">
                            {routes.map((route) => (
                              <li key={route.endpoint} data-endpoint={route.endpoint} data-model-id={route.modelId}>
                                <a
                                  href={endpointDocs(route.endpoint)}
                                  className="text-xs text-primary hover:underline"
                                  aria-label={`/${route.endpoint} · ${workloadNames[route.endpoint] ?? route.endpoint} guide`}
                                >
                                  <code>/{route.endpoint}</code>
                                </a>
                                {route.modelId !== id && (
                                  <code className="ml-1 font-mono text-xs text-muted-foreground">{route.modelId}</code>
                                )}
                                <RateList route={route} />
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">Provider catalog only</span>
                          <span className="block text-xs text-muted-foreground">
                            {upstream.map((name) => workloadNames[name] ?? (name === "text" ? "Text" : name)).join(", ")}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-col items-start gap-1">
                        {chat && (
                          <a href="/console/chat" className="flex items-center gap-1 text-xs text-primary hover:underline">
                            Open in chat <ArrowUpRight size={13} aria-hidden="true" />
                          </a>
                        )}
                        <CopyButton
                          text={id}
                          label={`Copy ID for ${model.name} on ${providerNames[model.provider]}`}
                          className="text-xs"
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
      <p className="text-xs text-muted-foreground">
        Sonnely rates include a 10% markup.{" "}
        <a href="/docs/providers#compare-prices" className="text-primary hover:underline">How pricing works</a>
        {" · "}
        <a href="/api/console/catalog" className="text-primary hover:underline">Catalog JSON</a>
      </p>
    </div>
  );
}
