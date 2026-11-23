export const apiOrigin = "https://sonnely.com";
export const apiBasePath = "/api/sonnely/v1";
export const limits = {
  bodyBytes: 36_000,
  messages: 32,
  charactersPerMessage: 12_000,
  defaultOutputTokens: 512,
  maxOutputTokens: 2_048,
} as const;
