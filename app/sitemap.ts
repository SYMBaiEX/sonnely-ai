import type { MetadataRoute } from "next";
import { apiOrigin } from "@/lib/api-contract";
import { articles } from "@/lib/journal";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/models", "/pricing", "/docs", "/blog", "/contact", "/terms", "/privacy", "/status"];
  return [...pages, ...articles.map(({ slug }) => "/blog/" + slug)].map((path) => ({
    url: apiOrigin + path,
  }));
}
