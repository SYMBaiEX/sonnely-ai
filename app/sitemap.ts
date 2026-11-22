import type { MetadataRoute } from "next";
import { apiOrigin } from "@/lib/api-contract";
import { articles } from "@/lib/journal";
import { docsSource } from "@/lib/docs-source";
import { computeFeatures, isComputeProduct } from "@/lib/compute-features";
import { productPages } from "@/lib/product-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const features = computeFeatures();
  const pages = ["/", "/models", "/pricing", "/blog", "/contact", "/terms", "/privacy", "/status"];
  return [
    ...pages,
    ...docsSource.getPages().map(({ url }) => url),
    ...Object.keys(productPages)
      .filter((page) => !isComputeProduct(page) || features[page])
      .map((page) => "/" + page),
    ...articles.map(({ slug }) => "/blog/" + slug),
  ].map((path) => ({
    url: apiOrigin + path,
  }));
}
