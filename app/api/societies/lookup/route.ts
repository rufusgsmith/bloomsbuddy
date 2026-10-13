// GET /api/societies/lookup?slug=chess-society  →  { slug, name } | 404 { error }
// Checks a society page exists on the SU website and reads its name. The slug comes from the
// link the student pasted. Just a page fetch, no Claude call, so it works in demo mode too.
import { isSlug, lookupSociety } from "@/lib/societies/su-site";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!isSlug(slug)) {
    return Response.json({ error: "Give me a society page slug" }, { status: 400 });
  }
  try {
    const society = await lookupSociety(slug);
    if (!society) return Response.json({ error: "Society not found" }, { status: 404 });
    return Response.json(society);
  } catch (err) {
    console.error("[societies/lookup] failed:", err);
    return Response.json({ error: "Couldn't reach the SU website" }, { status: 502 });
  }
}
