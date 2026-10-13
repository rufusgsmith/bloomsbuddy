// Shared check for bot walls (Cloudflare's "Just a moment…" page and friends). Server-side only.
// A blocked page often still returns HTML, so callers check the body as well as the status.

const CHALLENGE_MARKERS = ["Just a moment", "cf-chl", "challenge-platform"];

/** True if this response looks like a bot challenge rather than the real page. */
export function isBotChallenge(status: number, html: string): boolean {
  return status === 403 || status === 503 || CHALLENGE_MARKERS.some((m) => html.includes(m));
}

/** Thrown when a page is behind a bot wall, so callers can tell it apart from a plain failure. */
export class BlockedError extends Error {
  constructor(url: string) {
    super(`Blocked by a bot check: ${url}`);
    this.name = "BlockedError";
  }
}
