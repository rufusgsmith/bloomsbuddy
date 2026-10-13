// GET /api/societies/lookup?name=UCL Chess Society  →  { slug, name } | 404 { error }
// GET /api/societies/lookup?slug=chess-society      →  same, checking that exact slug
// Checks a society against the SU website during onboarding. Just a page fetch,
// no Claude call, so it works in demo mode too.
import { lookupSociety } from "@/lib/societies/su-site";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug")?.trim() ?? "";
  const name = slug || (params.get("name")?.trim() ?? "");
  if (!name || name.length > 100) {
    return Response.json({ error: "Give me a society name" }, { status: 400 });
  }
  try {
    const society = await lookupSociety(name, Boolean(slug));
    if (!society) return Response.json({ error: "Society not found" }, { status: 404 });
    return Response.json(society);
  } catch (err) {
    console.error("[societies/lookup] failed:", err);
    return Response.json({ error: "Couldn't reach the SU website" }, { status: 502 });
  }
}
