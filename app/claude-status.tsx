"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether the server has an ANTHROPIC_API_KEY. Read once by the root layout (server-side), so only
// this boolean reaches the browser. A public demo deploy leaves the key unset: then nothing can
// spend API credits, and every Claude feature shows NotConnectedNote instead.

const ClaudeStatus = createContext(true);

export function ClaudeStatusProvider({ connected, children }: { connected: boolean; children: ReactNode }) {
  return <ClaudeStatus.Provider value={connected}>{children}</ClaudeStatus.Provider>;
}

export const useClaudeConnected = () => useContext(ClaudeStatus);

/** What an API route sends back when the key is missing: { error, code: NO_KEY }, status 503. */
export const NO_KEY = "no_key";

/** Shown in place of anything that needs a live Claude call. */
export function NotConnectedNote({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="rounded-xl border border-line bg-background p-4 text-sm">
      <p className="font-semibold">Claude isn&apos;t connected</p>
      <p className="mt-1 text-muted">
        This demo site has no Claude API key, so live answers are off. {children}
      </p>
    </div>
  );
}
