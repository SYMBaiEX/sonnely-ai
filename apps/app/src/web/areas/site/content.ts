// spec/app/site/index.md, "Story: Check the service status"
import type { Endpoint, ProviderId } from "../../../../gen/app__models.ts";
import { apiBasePath, apiOrigin, endpointPaths, providerSlugs } from "./data.ts";

export const productsMenu = [
  {
    href: "/inference",
    label: "Confidential inference",
    detail: "Models and routing",
    icon: "Fingerprint",
  },
  { href: "/observability", label: "Observability", detail: "Traces and UsageMax", icon: "Radio" },
  { href: "/compute", label: "Compute", detail: "Explore compute products", icon: "Box" },
  { href: "/blackboxes", label: "Blackboxes", detail: "Attested VM rentals", icon: "Container" },
  { href: "/dry-docks", label: "Dry Docks", detail: "Isolated build sandboxes", icon: "Terminal" },
] as const;

export const headerLinks = [
  ["/models", "Models"],
  ["/models#billing", "Pricing"],
  ["/docs", "Docs"],
  ["/#journal-articles", "Journal"],
  ["/contact", "Contact"],
] as const;

export const pages = {
  inference: [
    "Confidential inference",
    "Send a request, stream the response, and meter every call through one OpenAI-compatible API.",
  ],
  observability: [
    "Inference observability",
    "Trace inference through the gateway, compare usage and latency, and reconcile compute costs with UsageMax.",
  ],
  compute: [
    "Compute on Sonnely",
    "Explore attested confidential VMs and isolated build sandboxes on Sonnely.",
  ],
  blackboxes: [
    "Blackboxes",
    "Rent an attested confidential VM. Deploy a pinned container image and inspect the workload attestation.",
  ],
  "dry-docks": [
    "Dry Docks",
    "An isolated build sandbox for pinned public GitHub commits, live logs, and downloadable artifacts.",
  ],
  models: [
    "Model catalog",
    "Compare the models you can run, what they cost, and the context they support.",
  ],
  contact: ["Talk to Sonnely", "Tell us what you’re building. If you’re stuck, share what you tried."],
} as const;

export type SitePageId = keyof typeof pages;
export const productPageIds = ["inference", "observability", "compute", "blackboxes", "dry-docks"] as const;
export type ProductPageId = (typeof productPageIds)[number];

export const entryActions = {
  inference: {
    section: "#routing",
    label: "Explore confidential routing",
    next: "/docs/quickstart",
    action: "Try the API quickstart",
  },
  observability: {
    section: "#traces",
    label: "Explore a sample trace",
    next: "/docs/observability",
    action: "Read the guide",
  },
  compute: {
    section: "#products",
    label: "Compare compute products",
    next: "/models#billing",
    action: "See compute pricing",
  },
  blackboxes: {
    section: "#rental",
    label: "Explore the rental",
    next: "/console/blackboxes",
    action: "Check pilot access",
  },
  "dry-docks": {
    section: "#workflow",
    label: "Explore the planned workflow",
    next: "/contact",
    action: "Talk to us",
  },
  models: {
    section: "#available-models",
    label: "Explore models",
    next: "/console/chat",
    action: "Try the playground",
  },
  contact: {
    section: "#support-form",
    label: "Open support form",
    next: "/docs/troubleshooting",
    action: "Troubleshoot the API",
  },
} as const;

export const platformLinks = [
  {
    href: "/inference",
    label: "Confidential inference",
    description: "Send a request, stream a completion, and verify its receipt.",
    icon: "Cpu",
  },
  {
    href: "/observability",
    label: "Inference observability",
    description: "Follow gateway traces, compare latency and costs, and surface operational alerts.",
    icon: "Activity",
  },
  {
    href: "/compute",
    label: "Compute",
    description: "Check availability for confidential VMs and isolated build sandboxes.",
    icon: "Boxes",
  },
] as const;

export const traceStages = [
  {
    name: "Reserve credits",
    start: 0,
    end: 96,
    icon: "Wallet",
    detail: "Place a hold for the estimated request cost.",
  },
  {
    name: "Inference",
    start: 96,
    end: 936,
    icon: "Radio",
    detail:
      "Run the request on confidential compute and collect the completion and token usage.",
  },
  {
    name: "Verify evidence",
    start: 936,
    end: 1128,
    icon: "Fingerprint",
    detail: "Check the evidence available for the request.",
  },
  {
    name: "Write settlement",
    start: 1128,
    end: 1200,
    icon: "ReceiptText",
    detail: "Record the final usage charge and release the unused hold.",
  },
] as const;

export const requestPathPoints = [
  [12, 76],
  [25, 76],
  [32, 65],
  [48, 65],
  [55, 55],
  [65, 55],
  [74, 41],
  [85, 41],
] as const;

export const requestPathSteps = [
  {
    point: 0,
    label: "Your client",
    short: "Client",
    icon: "Terminal",
    description:
      "Send a text request from the console or your OpenAI-compatible SDK over HTTPS.",
    link: "/docs/quickstart",
    action: "Integration guide",
  },
  {
    point: 3,
    label: "Sonnely gateway",
    short: "Gateway",
    icon: "Radio",
    description:
      "Sonnely can read the prompt while forwarding it. The usage ledger records request metadata and charges.",
    link: "/docs/attestation#data-handling",
    action: "Data handling",
  },
  {
    point: 7,
    label: "Confidential enclave",
    short: "Private TEE",
    icon: "Cpu",
    description:
      "The model runs in a hardware-isolated environment that publishes attestation evidence.",
    link: "/docs/attestation",
    action: "Attestation guide",
  },
] as const;

export const supportTopics = [
  ["Code2", "Workspace support", "API errors, keys, sign-in, and model access"],
  ["CreditCard", "Billing", "USDC payments, credit balances, and charges"],
  ["Send", "Infrastructure partnership", "Infrastructure and integration questions"],
] as const;

export const footerGroups = [
  {
    title: "Platform",
    links: [
      ["/inference", "Confidential inference"],
      ["/observability", "Observability"],
      ["/compute", "Compute"],
      ["/models", "Model catalog"],
      ["/models#billing", "Pricing"],
      ["/console/chat", "Playground"],
    ],
  },
  {
    title: "Developers",
    links: [
      ["/docs", "Documentation"],
      ["/docs/api", "API reference"],
      ["/docs/sdks", "SDKs"],
      ["/verify", "Receipt verification"],
      ["/status", "Status"],
    ],
  },
  {
    title: "Sonnely",
    links: [
      ["/#journal-articles", "Journal"],
      ["/contact", "Support"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ],
  },
] as const;

export const demoExamples = [
  {
    label: "Summarize",
    instruction: "Turn these handoff notes into a brief.",
    input:
      "Confirm the deadline with Rin. Review the draft Thursday. Share the revised plan afterward.",
    output:
      "Confirm the deadline with Rin, review the draft on Thursday, and share the revised plan afterward.",
  },
  {
    label: "Extract",
    instruction: "Extract the owner and due date as JSON.",
    input: "Rin will deliver the revised plan on Friday.",
    output: '{ "owner": "Rin", "due": "Friday" }',
  },
  {
    label: "Explain",
    instruction: "Explain what this retry delay does.",
    input: "const delay = attempt => 250 * 2 ** attempt;",
    output: "The delay starts at 250 milliseconds and doubles with each retry.",
  },
] as const;

export const demoLanguages = ["cURL", "Python", "JavaScript"] as const;
export type DemoLanguage = (typeof demoLanguages)[number];

const demoEndpoint = apiOrigin + apiBasePath;
const completionPath = apiBasePath + "/chat/completions";

export function requestCode(language: DemoLanguage, model: string, content: string) {
  const modelId = JSON.stringify(model);
  const message = JSON.stringify(content);
  if (language === "Python")
    return [
      "import os",
      "from openai import OpenAI",
      "",
      `client = OpenAI(base_url="${demoEndpoint}",`,
      '                api_key=os.environ["SONNELY_API_KEY"])',
      "reply = client.chat.completions.create(",
      `    model=${modelId},`,
      `    messages=[{"role": "user", "content": ${message}}],`,
      ")",
      "print(reply.choices[0].message.content)",
    ];
  if (language === "JavaScript")
    return [
      'import OpenAI from "openai";',
      "",
      "const client = new OpenAI({",
      `  baseURL: "${demoEndpoint}",`,
      "  apiKey: process.env.SONNELY_API_KEY,",
      "});",
      "const reply = await client.chat.completions.create({",
      `  model: ${modelId},`,
      `  messages: [{ role: "user", content: ${message} }],`,
      "});",
      "console.log(reply.choices[0].message.content);",
    ];
  return [
    'curl "' + apiOrigin + completionPath + '" ' + String.fromCharCode(92),
    '  -H "Authorization: Bearer $SONNELY_API_KEY" ' + String.fromCharCode(92),
    '  -H "Content-Type: application/json" ' + String.fromCharCode(92),
    "  -d '{",
    `    "model": ${modelId},`,
    '    "messages": [{"role": "user",',
    '      "content": ' + message.replaceAll("'", "'\\''") + "}]",
    "  }'",
  ];
}

const prompt = "Describe a quiet forest in one sentence.";
const jsonExamples: Partial<Record<Endpoint, object>> = {
  ChatCompletions: {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 128,
    stream: false,
  },
  Responses: { input: prompt, max_output_tokens: 128, store: false },
  Embeddings: { input: ["A quiet forest", "A busy city"] },
  Rerank: {
    query: "Where can I find woodland trails?",
    documents: ["The park has miles of forest paths.", "The museum is downtown."],
    top_n: 2,
  },
  ImagesGenerations: { prompt: "A watercolor landscape of a forest at sunrise", size: "512x512" },
  Systemone: {
    state: "The park opens at sunrise.",
    questions: {
      morning: { type: "noul", instructions: "Does the park open in the morning?" },
    },
  },
  AudioSpeech: { input: "Welcome to the trail.", voice: "neutral_female", response_format: "wav" },
  Redact: { text: "Send the trail map to hiker@example.com." },
};

const multipartExamples: Partial<Record<Endpoint, { args: string[]; note: string }>> = {
  ImagesEdits: {
    args: ["image=@input.png;type=image/png", "prompt=Change the sky to a soft violet"],
    note: "Use a PNG, JPEG, or WebP file up to 2 MB.",
  },
  AudioTranscriptions: {
    args: ["file=@recording.wav;type=audio/wav"],
    note: "Use a supported audio file up to 2 MB.",
  },
  AudioTranslations: {
    args: ["file=@recording.wav;type=audio/wav"],
    note: "Use a mono 16 kHz PCM16 WAV file up to 30 seconds long.",
  },
  ConvertFile: {
    args: ["files=@sample.pdf;type=application/pdf"],
    note: "Use one PDF up to 2 MB.",
  },
};

const apiUrl = apiOrigin + apiBasePath;
const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

export interface ApiExample {
  language: "cURL" | "Node.js";
  code: string;
  note?: string;
}

function realtimeExample(modelId: string): ApiExample {
  const url = new URL(apiUrl + "/realtime");
  url.protocol = "wss:";
  url.searchParams.set("model", modelId);
  return {
    language: "Node.js",
    note: "Install ws and use a raw mono 16 kHz PCM16 file up to 30 seconds long.",
    code: [
      'import { readFileSync } from "node:fs";',
      'import WebSocket from "ws";',
      "",
      'const audio = readFileSync("recording.pcm");',
      "const apiKey = process.env.SONNELY_API_KEY;",
      'if (!apiKey) throw new Error("Set SONNELY_API_KEY.");',
      "if (!audio.length || audio.length > 960_000 || audio.length % 2) {",
      '  throw new Error("Use a valid mono 16 kHz PCM16 recording.");',
      "}",
      "",
      "const socket = new WebSocket(" + JSON.stringify(url.href) + ", {",
      "  headers: { Authorization: `Bearer ${apiKey}` },",
      "  followRedirects: false,",
      "});",
      'socket.on("message", (message) => {',
      "  const event = JSON.parse(message.toString());",
      '  if (event.type === "session.created") {',
      "    for (let offset = 0; offset < audio.length; offset += 24_576) {",
      "      socket.send(JSON.stringify({",
      '        type: "input_audio_buffer.append",',
      '        audio: audio.subarray(offset, offset + 24_576).toString("base64"),',
      "      }));",
      "    }",
      '    socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));',
      '  } else if (event.type === "transcription.done") {',
      "    console.log(event.text);",
      "    socket.close();",
      '  } else if (event.type === "error") {',
      "    console.error(event.error);",
      "    process.exitCode = 1;",
      "    socket.close();",
      "  }",
      "});",
    ].join("\n"),
  };
}

export function modelApiExample(
  { endpoint, modelId }: { endpoint: Endpoint; modelId: string },
  provider: ProviderId,
): ApiExample {
  if (endpoint === "Realtime") return realtimeExample(modelId);
  const args = [
    "curl --fail-with-body --silent --show-error " +
      shellQuote(apiUrl + "/" + endpointPaths[endpoint]),
    '  -H "Authorization: Bearer $SONNELY_API_KEY"',
  ];
  if (endpoint === "AudioSpeech") args.push("  --output speech.wav");
  const joinCommand = (lines: string[]) => lines.join(" \\" + "\n");
  const multipart = multipartExamples[endpoint];
  if (multipart) {
    return {
      language: "cURL",
      code: joinCommand([
        ...args,
        ...["model=" + modelId, ...multipart.args].map((field) => "  -F " + shellQuote(field)),
      ]),
      note: multipart.note,
    };
  }
  const fields = jsonExamples[endpoint] ?? {};
  const payload = {
    model: modelId,
    ...(endpoint === "ChatCompletions" ? { provider: { only: [providerSlugs[provider]] } } : {}),
    ...fields,
  };
  return {
    language: "cURL",
    code: joinCommand([
      ...args,
      '  -H "Content-Type: application/json"',
      "  --data " + shellQuote(JSON.stringify(payload, null, 2)),
    ]),
  };
}
