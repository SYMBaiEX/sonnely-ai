import { defineConfig, defineDocs } from "fumadocs-mdx/config";

const guideWrappers = new Set(["Step", "Steps", "Tab", "Tabs"]);
const guideLayoutClasses = new Set([
  "docs-event-sequence",
  "docs-guide-facts",
  "docs-guide-next",
  "docs-guide-procedure",
]);

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
              typeof attribute.value === "string" &&
              guideLayoutClasses.has(attribute.value),
          );
          return guideLayout ? "children-only" : true;
        },
      },
    },
  },
});
export default defineConfig();
