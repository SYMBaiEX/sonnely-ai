// Phala /api/v1/instance-types reports compute separately from SSD storage.
export const blackboxMachineIds = ["tdx.small", "tdx.medium", "tdx.large"] as const;
export type BlackboxMachine = (typeof blackboxMachineIds)[number];

export const blackboxMachines = {
  "tdx.small": { name: "Small", cpu: 1, ram: 2, hourlyCompute: 58_000 },
  "tdx.medium": { name: "Medium", cpu: 2, ram: 4, hourlyCompute: 116_000 },
  "tdx.large": { name: "Large", cpu: 4, ram: 8, hourlyCompute: 232_000 },
} satisfies Record<BlackboxMachine, { name: string; cpu: number; ram: number; hourlyCompute: number }>;

export const blackboxDiskSizes = [20, 40, 80] as const;
export type BlackboxDisk = (typeof blackboxDiskSizes)[number];

export const defaultBlackboxMachine: BlackboxMachine = "tdx.small";
export const defaultBlackboxDisk: BlackboxDisk = 20;
export const blackboxDiskHourlyRate = 139;

export function blackboxHourlyBase(
  machine: BlackboxMachine = defaultBlackboxMachine,
  disk: BlackboxDisk = defaultBlackboxDisk,
) {
  return blackboxMachines[machine].hourlyCompute + disk * blackboxDiskHourlyRate;
}

export function blackboxSize(
  machine: BlackboxMachine = defaultBlackboxMachine,
  disk: BlackboxDisk = defaultBlackboxDisk,
) {
  const { cpu, ram } = blackboxMachines[machine];
  return `${cpu} vCPU · ${ram} GB RAM · ${disk} GB SSD`;
}

export const blackboxPresets = {
  nginx: {
    title: "NGINX web server",
    description: "Start a lightweight web server and verify that HTTPS is reachable.",
    image:
      "docker.io/nginx/nginx-unprivileged@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd",
    port: 8080,
  },
  httpbin: {
    title: "HTTP playground",
    description: "Try HTTP methods, status codes, headers, and response formats.",
    image:
      "docker.io/mccutchen/go-httpbin@sha256:873b4fdb27fe7cc66fa12cb9362574e1b0bf31df7ca8a71b2502988327a0b8a4",
    port: 8080,
  },
  whoami: {
    title: "Request inspector",
    description: "See the client and proxy headers your workload receives.",
    image: "docker.io/traefik/whoami@sha256:200689790a0a0ea48ca45992e0450bc26ccab5307375b41c84dfc4f2475937ab",
    port: 80,
  },
} as const;

export type BlackboxPreset = keyof typeof blackboxPresets;

export const blackboxAgentPresets = {
  hermes: {
    title: "Hermes Agent",
    description: "Nous Research agent gateway",
    port: 8642,
    setup:
      "Start the Hermes gateway with its HTTP API enabled on port 8642. Configure API authentication and a model provider before exposing the gateway.",
    docs: "https://hermes-agent.nousresearch.com/docs/user-guide/docker",
  },
  openclaw: {
    title: "OpenClaw",
    description: "Personal agent gateway",
    port: 18789,
    setup:
      "Configure a token-protected OpenClaw gateway on port 18789. For the Control UI, configure the allowed HTTPS origin and follow OpenClaw’s pairing instructions.",
    docs: "https://docs.openclaw.ai/install/docker",
  },
  eliza: {
    title: "ElizaOS",
    description: "Agents with characters and plugins",
    port: 3000,
    setup:
      "Package your ElizaOS agent, its character, and its plugins. Configure API authentication and make the agent server listen on the container HTTP port.",
    docs: "https://github.com/elizaos/eliza",
  },
  mastra: {
    title: "Mastra",
    description: "TypeScript agents and workflows",
    port: 4111,
    setup:
      "Build and package your Mastra server with its agents and workflows. Configure server authentication before serving its routes on port 4111.",
    docs: "https://mastra.ai/docs",
  },
  pydantic: {
    title: "Pydantic AI",
    description: "Python agents served by FastAPI",
    port: 8000,
    setup:
      "Package your agent as an authenticated FastAPI service. Bind the ASGI server to 0.0.0.0 on port 8000, or set your app’s HTTP port below.",
    docs: "https://pydantic.dev/docs/ai/examples/conversational-agents/chat-app/",
  },
} as const;

export type BlackboxAgentPreset = keyof typeof blackboxAgentPresets;
