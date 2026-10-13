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
