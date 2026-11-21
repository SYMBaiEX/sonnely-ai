export const models = [
  {
    id: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    name: "DeepSeek V4.1 Flash",
    type: "General",
    context: "1.05M",
    input: 0.3,
    output: 1.2,
    cache: 0.006,
    mark: "D",
    color: "pearl",
    summary: "General-purpose reasoning and long document workflows.",
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    type: "Fast",
    context: "1.05M",
    input: 0.08,
    output: 0.5,
    cache: 0.012,
    mark: "G",
    color: "signal-mark",
    summary: "Fast classification, extraction and short replies.",
  },
  {
    id: "Qwen/Qwen3.6-35B-A3B-FP8",
    name: "Qwen 3.6 35B",
    type: "Coding",
    context: "262K",
    input: 0.17,
    output: 1.1,
    cache: 0.056,
    mark: "Q",
    color: "smoke",
    summary: "Code explanation, structured output and multilingual text.",
  },
] as const;
export const usd = (micros: number) =>
  "$" + (micros / 1_000_000).toFixed(micros > 0 && micros < 10_000 ? 6 : 2);
export const shorten = (wallet: string) => wallet.slice(0, 4) + "…" + wallet.slice(-4);
