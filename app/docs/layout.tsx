import type { ReactNode } from "react";
import Image from "next/image";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { SidebarProvider, SidebarTrigger, useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { RootProvider } from "fumadocs-ui/provider/next";
import { docsSource } from "@/lib/docs-source";
import { SonnelyDocsSidebar } from "./sidebar";
import "./docs.css";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ storageKey: "sonnely.theme", defaultTheme: "dark" }}>
      <div className="docs-shell">
        <DocsLayout
          tree={docsSource.getPageTree()}
          themeSwitch={{ enabled: false }}
          nav={{
            url: "/docs",
            title: (
              <span className="docs-brand">
                <Image src="/brand/sonnely-crimson.svg" width={25} height={25} alt="" />
                Sonnely Docs
              </span>
            ),
          }}
          slots={{
            sidebar: {
              root: SonnelyDocsSidebar,
              provider: SidebarProvider,
              trigger: SidebarTrigger,
              useSidebar,
            },
          }}
        >
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
