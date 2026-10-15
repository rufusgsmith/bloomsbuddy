import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import { TabBar } from "./tab-bar";

// One family for everything (see "Visual design" in CLAUDE.md).
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bloomsbuddy",
  description: "Make the most of the gaps between your UCL lectures.",
};

// "cover" lets the tab bar sit under the iPhone home indicator, padded by safe-area-inset-bottom.
export const viewport: Viewport = {
  viewportFit: "cover",
  // The phone's status bar matches the page background (see globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121513" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <TabBar />
      </body>
    </html>
  );
}
