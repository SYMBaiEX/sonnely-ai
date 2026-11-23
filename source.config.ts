import { defineConfig, defineDocs } from "fumadocs-mdx/config";

const guideWrappers = new Set(["Step", "Steps", "Tab", "Tabs"]);

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      includeProcessedMarkdown: {
        filterElement(node) {
          if (node.type !== "mdxJsxFlowElement") return true;
          if (node.name && guideWrappers.has(node.name)) return "children-only";
          const guideLayout = node.attributes.some(
            (attribute) =>
              attribute.type === "mdxJsxAttribute" &&
              attribute.name === "className" &&
              (attribute.value === "docs-event-sequence" || attribute.value === "docs-guide-next"),
          );
          return guideLayout ? "children-only" : true;
        },
      },
    },
  },
});
export default defineConfig();
