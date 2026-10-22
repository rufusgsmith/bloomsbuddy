import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { ClaudeStatusProvider } from "./claude-status";
import { SideNav } from "./side-nav";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Bloomsbuddy",
  description: "Make the most of the gaps between your UCL lectures.",
};

export const viewport: Viewport = {
  // The browser bar matches the phone's top bar (see globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#23282f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col md:flex-row">
        {/* Only whether a key is set reaches the browser, never the key itself. */}
        <ClaudeStatusProvider connected={Boolean(process.env.ANTHROPIC_API_KEY)}>
          <SideNav />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </ClaudeStatusProvider>
      </body>
    </html>
  );
}
