export const routeLabels = {
  "private-tee": "Private TEE",
  "private-3p-tee": "Private 3P TEE",
  incognito: "Incognito",
  unclassified: "Unclassified",
} as const;

export type PrivacyRoute = keyof typeof routeLabels;

export const providerNames: Record<string, string> = {
  nearai: "NEAR AI",
  "attested 3p": "Attested third party",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  google: "Google",
  levanto: "Levanto",
  moonshotai: "Moonshot AI",
  openai: "OpenAI",
  typesafe: "Typesafe",
  "x-ai": "xAI",
};

export type ProviderModel = {
  id: string;
  name: string;
  owner: string;
  inputs: string[];
  outputs: string[];
  context: number;
  route: PrivacyRoute;
};
