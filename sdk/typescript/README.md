# Sonnely SDK for TypeScript

Run text inference on Sonnely from Node.js 22 or newer. Create a funded [Sonnely API key](https://sonnely.com/console/keys) and store it server-side as `SONNELY_API_KEY`.

```ts
import { Sonnely } from "sonnely-sdk";

const sonnely = new Sonnely({ apiKey: process.env.SONNELY_API_KEY });
const request = {
  model: "z-ai/glm-5.3-flash",
  messages: [{ role: "user" as const, content: "Describe winter in two words." }],
  max_tokens: 128,
  max_cost_microusd: 500,
};
const result = await sonnely.complete(request, { receipt: true });
console.log(result.choices[0]?.message.content, result.usage);
```

Call `models()` for live routes and rates. Use `stream(request, { receipt: true })` for an async iterator that yields text deltas and final usage. The iterator requires the gateway's settlement marker to complete normally. Each completion or stream is billed separately.

[SDK guide](https://docs.sonnely.com/docs/sdks) · [API reference](https://docs.sonnely.com/docs/api) · [Usage](https://sonnely.com/console/usage)
