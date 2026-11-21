import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    return [
      ...[
        "/signin",
        "/account",
        "/dashboard/:path*",
        "/chat",
        "/developers",
        "/compare",
        "/how-it-works",
        "/about",
        "/learn/:path*",
        "/roadmap",
        "/methodology",
        "/calculator",
        "/alternatives",
        "/install.sh",
        "/cli/:path*",
      ].map((source) => ({
        source,
        destination: "https://app.sonnely.com" + source,
        permanent: false,
      })),
    ];
  },
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: "/api/sonnely/v1/:path*" },
      { source: "/api/relay/:task", destination: "/api/sonnely/:task" },
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
