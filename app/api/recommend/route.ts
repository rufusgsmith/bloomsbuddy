// POST /api/recommend  body: { gap: Gap, dayGaps?: Gap[] }  →  Recommendation
// dayGaps (the rest of that day's gaps) is optional context so Claude can plan around longer gaps.
import { recommendForGap } from "@/lib/recommend/recommend";
import type { Gap } from "@/lib/types";

function isGap(x: unknown): x is Gap {
  const g = x as Partial<Gap> | null;
  return (
    typeof g?.id === "string" &&
    typeof g.start === "string" &&
    typeof g.end === "string" &&
    typeof g.locationId === "string" &&
    typeof g.nextLocationId === "string" &&
    typeof g.usableMins === "number" &&
    typeof g.prevEvent === "object" &&
    typeof g.nextEvent === "object"
  );
}

export async function POST(request: Request) {
  let body: { gap?: unknown; dayGaps?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { gap }" }, { status: 400 });
  }
  if (!isGap(body.gap)) {
    return Response.json({ error: "Missing or malformed `gap`" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[recommend] ANTHROPIC_API_KEY is not set");
    return Response.json({ error: "Recommendations are unavailable right now" }, { status: 502 });
  }

  try {
    // Malformed dayGaps are dropped rather than rejected: they're only extra context.
    const dayGaps = Array.isArray(body.dayGaps) ? body.dayGaps.filter(isGap) : [];
    return Response.json(await recommendForGap(body.gap, dayGaps));
  } catch (err) {
    console.error("[recommend] failed:", err);
    return Response.json({ error: "Couldn't get a recommendation, try again" }, { status: 502 });
  }
}
