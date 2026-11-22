import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { SidebarProvider, SidebarTrigger, useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { RootProvider } from "fumadocs-ui/provider/next";
import { SiteHeader } from "@/components/site-header";
import { apiOrigin } from "@/lib/api-contract";
import { themeKey } from "@/lib/appearance";
import { docsSource } from "@/lib/docs-source";
import { SonnelyDocsSidebar } from "./sidebar";
import { DocsThemeSwitch } from "./theme-switch";
import "./docs.css";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ storageKey: themeKey, defaultTheme: "dark" }}>
      <div className="docs-shell">
        <SiteHeader homeHref={apiOrigin} themeSwitch={<DocsThemeSwitch />} />
        <DocsLayout
          tree={docsSource.getPageTree()}
          themeSwitch={{ enabled: false }}
          nav={{
            url: "/docs",
            title: (
              <span className="docs-brand">
                <BookOpen size={18} aria-hidden="true" />
                Documentation
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
