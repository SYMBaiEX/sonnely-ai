import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fathom Relay | Private AI on Solana", template: "%s | Fathom Relay" },
  description:
    "A Solana-native workspace for confidential inference, model discovery, and metered API access.",
  icons: { icon: "/mark.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
