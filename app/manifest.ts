import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sonnely",
    short_name: "Sonnely",
    start_url: "/console",
    display: "browser",
    icons: [
      { src: "/brand/sonnely-crimson-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/sonnely-crimson-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
