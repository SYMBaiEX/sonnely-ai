import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import { computeFeatures, computeProducts } from "./lib/compute-features";
import { apiOrigin } from "./lib/api-contract";

const legacyDocs = {
  "api-reference": "api",
  authentication: "keys",
  credits: "billing",
  models: "providers",
  teams: "workspace",
  cli: "migration",
  media: "migration",
} as const;

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    const legacySite = [
      ["/signin", "/console"],
      ["/account", "/console"],
      ["/dashboard/api", "/console/keys"],
      ["/dashboard/:path*", "/console"],
      ["/chat", "/console"],
      ["/developers", "/docs/api"],
      ["/compare", "/models"],
      ["/how-it-works", "/docs"],
      ["/about", "/"],
      ["/learn/credits-101", "/docs/billing"],
      ["/learn/keys-and-teams", "/docs/keys"],
      ["/learn/pick-a-model", "/models"],
      ["/learn/:path*", "/docs"],
      ["/roadmap", "/"],
      ["/methodology", "/docs/attestation"],
      ["/calculator", "/pricing#cost-example-heading"],
      ["/alternatives", "/models"],
    ].map(([source, path]) => ({
      source,
      destination: apiOrigin + path,
      permanent: true,
    }));
    const features = computeFeatures();
    return [
      ...legacySite,
      ...computeProducts
        .filter((kind) => !features[kind])
        .flatMap((kind) => [
          { source: "/" + kind, destination: "/compute#" + kind, permanent: false },
          { source: "/console/" + kind, destination: "/console", permanent: false },
        ]),
      ...Object.entries(legacyDocs).flatMap(([old, current]) => [
        { source: "/docs/" + old, destination: "/docs/" + current, permanent: true },
        { source: "/docs/" + old + ".md", destination: "/docs/" + current + ".md", permanent: true },
        {
          source: "/llms.mdx/docs/" + old + "/content.md",
          destination: "/docs/" + current + ".md",
          permanent: true,
        },
      ]),
    ];
  },
  async rewrites() {
    return [
      { source: "/docs/:topic.md", destination: "/llms.mdx/docs/:topic/content.md" },
      { source: "/v1/:path*", destination: "/api/sonnely/v1/:path*" },
      { source: "/api/relay/:task", destination: "/api/sonnely/:task" },
      { source: "/install.sh", destination: "/api/v1" },
      { source: "/cli/:path*", destination: "/api/v1" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default createMDX()(config);
