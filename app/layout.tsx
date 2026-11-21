import type { Metadata, Viewport } from "next";
import { apiOrigin } from "@/lib/api-contract";
import { seasonBeforePaint, themeBeforePaint } from "@/lib/appearance";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import "./experience.css";

export const viewport: Viewport = { viewportFit: "cover" };

export const metadata: Metadata = {
  metadataBase: new URL(apiOrigin),
  title: { default: "Sonnely | Private AI on Solana", template: "%s | Sonnely" },
  description:
    "A Solana-native workspace for confidential inference, model discovery, and metered API access.",
  icons: {
    icon: { url: "/brand/sonnely-crimson.svg", type: "image/svg+xml", sizes: "any" },
    apple: { url: "/apple-icon.png?v=crimson", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBeforePaint + ";\n" + seasonBeforePaint }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
