import type { ReactNode } from "react";
import Image from "next/image";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { apiOrigin } from "@/lib/api-contract";
import { docsSource } from "@/lib/docs-source";
import "./docs.css";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ storageKey: "sonnely.theme", defaultTheme: "dark" }}>
      <div className="docs-shell">
        <DocsLayout
          tree={docsSource.getPageTree()}
          nav={{
            url: "/docs",
            title: (
              <span className="docs-brand">
                <Image src="/brand/sonnely-crimson.svg" width={25} height={25} alt="" />
                Sonnely Docs
              </span>
            ),
          }}
          links={[
            { text: "Sonnely", url: apiOrigin },
            { text: "Console", url: apiOrigin + "/console" },
            { text: "Service status", url: apiOrigin + "/status" },
          ]}
        >
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
