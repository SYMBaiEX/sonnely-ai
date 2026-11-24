import { ArrowDown, Braces } from "lucide-react";
import { apiBasePath, apiOrigin } from "@/lib/api-contract";
import { CopyButton } from "@/components/shared";

const endpoints = [
  ["GET", "/models", "#list-models", "Discover model IDs and provider rates"],
  ["GET", "/provider-models", "#provider-catalogs", "Browse upstream model inventories"],
  ["POST", "/chat/completions", "#create-a-completion", "Generate text or stream a completion"],
  ["POST", "/embeddings", "#specialized-inference", "Create text embeddings"],
  ["POST", "/rerank", "#specialized-inference", "Rank documents by relevance"],
  ["POST", "/images/generations", "#specialized-inference", "Generate a single image"],
  ["POST", "/images/edits", "#specialized-inference", "Edit an uploaded image"],
  ["POST", "/systemone", "#specialized-inference", "Evaluate text decisions"],
  ["POST", "/audio/transcriptions", "#specialized-inference", "Transcribe audio"],
  ["POST", "/audio/speech", "#specialized-inference", "Synthesize speech"],
] as const;

export function ApiReferenceEntry() {
  const baseUrl = apiOrigin + apiBasePath;
  return (
    <div className="docs-api-entry">
      <div className="docs-api-base">
        <div>
          <span>
            <Braces size={16} aria-hidden="true" /> Base URL
          </span>
          <code>{baseUrl}</code>
        </div>
        <CopyButton value={baseUrl} label="Copy base URL" />
      </div>
      <nav className="docs-endpoints" aria-label="API endpoints">
        {endpoints.map(([method, path, anchor, description]) => (
          <a href={anchor} key={path}>
            <span className="docs-http-method" data-method={method}>
              {method}
            </span>
            <span>
              <code>{path}</code>
              <small>{description}</small>
            </span>
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        ))}
      </nav>
    </div>
  );
}
