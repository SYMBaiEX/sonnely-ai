import { loader } from "fumadocs-core/source";
import { computeFeatures, isComputeProduct } from "./compute-features";
import { docs } from "../.source/server";

const source = docs.toFumadocsSource();
const features = computeFeatures();
export const docsSource = loader({
  baseUrl: "/docs",
  source: {
    ...source,
    files: source.files.flatMap((file): typeof source.files => {
      const id = file.path.replace(/\.mdx?$/, "");
      if (isComputeProduct(id) && !features[id]) return [];
      if (file.type !== "meta" || !file.data.pages) return [file];
      const enabled = features.blackboxes || features["dry-docks"];
      const pages = file.data.pages.filter((page) =>
        isComputeProduct(page) ? features[page] : page !== "---Compute---" || enabled,
      );
      return [{ ...file, data: { ...file.data, pages } }];
    }),
  },
});
