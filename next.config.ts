import type { NextConfig } from "next";
import { apiOrigin } from "./lib/api-contract";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    return [
      ["/signin", "/console"],
      ["/account", "/console"],
      ["/dashboard/api", "/console/keys"],
      ["/dashboard/:path*", "/console"],
      ["/chat", "/console"],
      ["/developers", "/docs#api"],
      ["/compare", "/models"],
      ["/how-it-works", "/docs"],
      ["/about", "/"],
      ["/learn/credits-101", "/docs#settlement"],
      ["/learn/keys-and-teams", "/docs#keys"],
      ["/learn/pick-a-model", "/models"],
      ["/learn/:path*", "/docs"],
      ["/roadmap", "/"],
      ["/methodology", "/docs#verification"],
      ["/calculator", "/pricing#cost-example-heading"],
      ["/alternatives", "/models"],
    ].map(([source, path]) => ({
      source,
      destination: apiOrigin + path,
      permanent: true,
    }));
  },
  async rewrites() {
    return [
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

export default config;
