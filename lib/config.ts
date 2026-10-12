// Demo mode is ON unless explicitly disabled, so a missing env var on Vercel
// falls back to mock data instead of breaking the demo.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}
