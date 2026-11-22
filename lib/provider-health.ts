import { managedProviderKey } from "./managed-access";
import { phalaOrigin } from "./phala";
import { providerIds } from "./provider-catalog";

export async function providerHealth() {
  return Promise.all(
    providerIds.map(async (provider) => {
      const key = managedProviderKey(provider);
      if (!key) return { provider, state: "disabled" as const };
      let state: "ok" | "unavailable" = "unavailable";
      try {
        const options = {
          headers: { Authorization: "Bearer " + key },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(4_000),
        } as const;
        const response =
          provider === "tinfoil"
            ? await (
                await import("./tinfoil")
              )
                .fetchTinfoil(options, "/v1/models")
                .then(({ response }) => response)
            : await fetch(
                (provider === "phala" ? phalaOrigin : "https://cloud-api.near.ai") + "/v1/models",
                options,
              );
        state = response.ok ? "ok" : "unavailable";
        await response.body?.cancel().catch(() => {});
      } catch {
        // A missing or unreachable upstream must never expose credentials on status.
      }
      return { provider, state };
    }),
  );
}
