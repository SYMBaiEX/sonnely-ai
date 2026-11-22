import type { MetadataRoute } from "next";
import { apiOrigin } from "@/lib/api-contract";
import { articles } from "@/lib/journal";
import { docsSource } from "@/lib/docs-source";
import { productPages } from "@/lib/product-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/models", "/pricing", "/blog", "/contact", "/terms", "/privacy", "/status"];
  return [
    ...pages,
    ...docsSource.getPages().map(({ url }) => url),
    ...Object.keys(productPages).map((page) => "/" + page),
    ...articles.map(({ slug }) => "/blog/" + slug),
  ].map((path) => ({
    url: apiOrigin + path,
  }));
}
