// GET /api/societies/lookup?name=UCL Chess Society  →  { slug, name } | 404 { error }
// Checks a typed society name against the SU site during onboarding. Just a page fetch,
// no Claude call, so it works in demo mode too.
import { lookupSociety } from "@/lib/societies/su-site";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 100) {
    return Response.json({ error: "Give me a society name" }, { status: 400 });
  }
  try {
    const society = await lookupSociety(name);
    if (!society) return Response.json({ error: "Society not found" }, { status: 404 });
    return Response.json(society);
  } catch (err) {
    console.error("[societies/lookup] failed:", err);
    return Response.json({ error: "Couldn't reach the SU website" }, { status: 502 });
  }
}
