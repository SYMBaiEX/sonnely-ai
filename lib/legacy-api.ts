import { apiBasePath, apiOrigin } from "./api-contract";

export function retiredApi(request: Request) {
  const message = {
    error: {
      code: "legacy_api_retired",
      message: "The original Sonnely API has been retired. Use a key from the current Sonnely console.",
      base_url: apiOrigin + apiBasePath,
      documentation: apiOrigin + "/docs#migration",
    },
  };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(message), {
    status: 410,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}
