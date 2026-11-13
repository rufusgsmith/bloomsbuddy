// Demo mode is ON unless explicitly disabled, so a missing env var on Vercel
// falls back to mock data instead of breaking the demo.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}

// The hosted site only shows the demo week: no own data, no setup, no Claude. `npm run dev` is the full app.
// shortcut: every production build is demo-only (Vercel previews too); switch to an env var when an own version goes online.
export const DEMO_ONLY = process.env.NODE_ENV === "production";
