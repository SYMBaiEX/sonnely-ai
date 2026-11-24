import { apiBasePath } from "@/lib/api-contract";
import { routeLabels } from "@/lib/model-privacy";
import { providerCatalog, providerIds, providerNames } from "@/lib/provider-models";
import { specializedModels } from "@/lib/specialized-models";

export function ProviderInventory() {
  return (
    <section className="section provider-inventory" aria-labelledby="provider-inventory-title">
      <header className="section-head">
        <div>
          <h2 id="provider-inventory-title">Full provider catalogs</h2>
          <p>
            Provider inventory as of {providerCatalog.asOf}. Each entry identifies the matching Sonnely API
            endpoint when supported.{" "}
            <a className="text-link" href={apiBasePath + "/provider-models"}>
              View JSON
            </a>
          </p>
        </div>
      </header>
      <div className="panel stack-panel">
        {providerIds.map((provider) => (
          <details key={provider}>
            <summary>
              {providerNames[provider]} · {providerCatalog.providers[provider].length} models
            </summary>
            <ul>
              {providerCatalog.providers[provider].map((model) => {
                const endpoint = Object.entries(specializedModels).find(([, routes]) =>
                  Object.entries(routes).some(
                    ([id, route]) => model.id === id && provider === route.provider,
                  ),
                )?.[0];
                return (
                  <li key={model.id}>
                    <strong>{model.name}</strong>{" "}
                    <span className="caption">
                      · {routeLabels[model.route]} · {model.workload}
                    </span>
                    <p className="caption">
                      {model.chatId ? (
                        <>
                          Sonnely Chat Completions · <code>{model.chatId}</code>
                        </>
                      ) : endpoint ? (
                        <>
                          Sonnely <code>/{endpoint}</code> · <code>{model.id}</code>
                        </>
                      ) : (
                        <>
                          Provider catalog only · <code>{model.id}</code>
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
