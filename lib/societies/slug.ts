// Society name → SU page slug. Pure, no cheerio, so client components can use it too.

/** "UCL Chess Society" → "chess-society", "Baking & Pastry" → "baking-and-pastry". */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^ucl\b\s*/, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const isSlug = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

/**
 * A society's SU page link → its slug, e.g.
 * "https://studentsunionucl.org/clubs-societies/computer-science-society/events?x=1" → "computer-science-society".
 * A bare slug works too. Null if it isn't a society page on the SU site.
 */
export function slugFromLink(input: string): string | null {
  const text = input.trim();
  if (isSlug(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.hostname.replace(/^www\./, "") !== "studentsunionucl.org") return null;
  const match = url.pathname.match(/^\/clubs-societies\/([^/]+)/);
  const slug = match?.[1].toLowerCase() ?? "";
  return isSlug(slug) ? slug : null;
}
