import { ArrowDown, Braces } from "lucide-react";
import { apiBasePath, apiOrigin } from "@/lib/api-contract";
import { CopyButton } from "@/components/shared";

const endpoints = [
  ["GET", "/models", "#list-models", "Discover model IDs and provider rates"],
  ["POST", "/chat/completions", "#create-a-completion", "Generate text or stream a completion"],
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
          <a href={anchor} key={method}>
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
