import { apiBasePath, apiOrigin } from "./api-contract";
import type { ModelCatalogEndpoint, ModelCatalogRoute } from "./model-catalog";
import type { ProviderId } from "./provider-models";

const prompt = "Describe a quiet forest in one sentence.";
const jsonExamples = {
  "chat/completions": {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 128,
    stream: false,
  },
  responses: { input: prompt, max_output_tokens: 128, store: false },
  embeddings: { input: ["A quiet forest", "A busy city"] },
  rerank: {
    query: "Where can I find woodland trails?",
    documents: ["The park has miles of forest paths.", "The museum is downtown."],
    top_n: 2,
  },
  "images/generations": { prompt: "A watercolor landscape of a forest at sunrise", size: "512x512" },
  systemone: {
    state: "The park opens at sunrise.",
    questions: {
      morning: { type: "noul", instructions: "Does the park open in the morning?" },
    },
  },
  "audio/speech": { input: "Welcome to the trail.", voice: "neutral_female", response_format: "wav" },
  redact: { text: "Send the trail map to hiker@example.com." },
} satisfies Partial<Record<ModelCatalogEndpoint, object>>;

const multipartExamples = {
  "images/edits": {
    args: ["image=@input.png;type=image/png", "prompt=Change the sky to a soft violet"],
    note: "Use a PNG, JPEG, or WebP file up to 2 MB.",
  },
  "audio/transcriptions": {
    args: ["file=@recording.wav;type=audio/wav"],
    note: "Use a supported audio file up to 2 MB.",
  },
  "audio/translations": {
    args: ["file=@recording.wav;type=audio/wav"],
    note: "Use a mono 16 kHz PCM16 WAV file up to 30 seconds long.",
  },
  "convert/file": {
    args: ["files=@sample.pdf;type=application/pdf"],
    note: "Use one PDF up to 2 MB.",
  },
} satisfies Partial<Record<ModelCatalogEndpoint, { args: string[]; note: string }>>;

const apiUrl = apiOrigin + apiBasePath;
const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

type ApiExample = { language: "cURL" | "Node.js"; code: string; note?: string };

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

export function modelApiExample({ endpoint, modelId }: ModelCatalogRoute, provider: ProviderId): ApiExample {
  if (endpoint === "realtime") return realtimeExample(modelId);
  const args = [
    "curl --fail-with-body --silent --show-error " + shellQuote(apiUrl + "/" + endpoint),
    '  -H "Authorization: Bearer $SONNELY_API_KEY"',
  ];
  if (endpoint === "audio/speech") args.push("  --output speech.wav");
  const joinCommand = (lines: string[]) => lines.join(" \\" + "\n");
  if (endpoint in multipartExamples) {
    const { args: fields, note } = multipartExamples[endpoint as keyof typeof multipartExamples];
    return {
      language: "cURL",
      code: joinCommand([
        ...args,
        ...["model=" + modelId, ...fields].map((field) => "  -F " + shellQuote(field)),
      ]),
      note,
    };
  }
  const fields = jsonExamples[endpoint as keyof typeof jsonExamples];
  const payload = {
    model: modelId,
    ...(endpoint === "chat/completions" ? { provider: { only: [provider] } } : {}),
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
