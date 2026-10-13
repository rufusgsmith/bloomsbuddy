// POST /api/recommend  body: { gap: Gap, dayGaps?: Gap[], deadlines?: Deadline[] }  →  Recommendation
// dayGaps (the rest of that day's gaps) is optional context so Claude can plan around longer gaps.
// deadlines are the student's own (from onboarding). When sent, even empty, they replace the mock ones.
import { recommendForGap } from "@/lib/recommend/recommend";
import type { Deadline, Gap } from "@/lib/types";

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

function isDeadline(x: unknown): x is Deadline {
  const d = x as Partial<Deadline> | null;
  return (
    typeof d?.id === "string" &&
    typeof d.moduleCode === "string" &&
    typeof d.title === "string" &&
    typeof d.due === "string" &&
    !Number.isNaN(Date.parse(d.due))
  );
}

export async function POST(request: Request) {
  let body: { gap?: unknown; dayGaps?: unknown; deadlines?: unknown };
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
    const deadlines = Array.isArray(body.deadlines) ? body.deadlines.filter(isDeadline) : undefined;
    return Response.json(await recommendForGap(body.gap, dayGaps, { deadlines }));
  } catch (err) {
    console.error("[recommend] failed:", err);
    return Response.json({ error: "Couldn't get a recommendation, try again" }, { status: 502 });
  }
}
