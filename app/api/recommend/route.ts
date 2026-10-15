// POST /api/recommend  body: { gap: Gap, dayGaps?: Gap[], deadlines?: Deadline[] }  →  Recommendation
// dayGaps (the rest of that day's gaps) is optional context so Claude can plan around longer gaps.
// deadlines are the student's own (from onboarding). When sent, even empty, they replace the mock ones.
// societies are the student's SU societies; outside demo mode their real events replace the mock ones.
// home ({ label, lat, lng }) is where the student lives, so Claude can suggest popping back.
// todos are the To-do tab's open and repeating items; recommendForGap keeps the ones that fit the gap.
// addedEventIds are society event ids already on the student's calendar: fixed plans, never suggested again.
// The student fields are checked by parseStudentContext (lib/recommend/request.ts), shared with /api/chat.
import { recommendForGap } from "@/lib/recommend/recommend";
import { parseStudentContext } from "@/lib/recommend/request";
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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { gap }" }, { status: 400 });
  }
  if (!isGap(body?.gap)) {
    return Response.json({ error: "Missing or malformed `gap`" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[recommend] ANTHROPIC_API_KEY is not set");
    return Response.json({ error: "Recommendations are unavailable right now" }, { status: 502 });
  }

  try {
    // Malformed dayGaps are dropped rather than rejected: they're only extra context.
    const dayGaps = Array.isArray(body.dayGaps) ? body.dayGaps.filter(isGap) : [];
    return Response.json(await recommendForGap(body.gap, dayGaps, parseStudentContext(body)));
  } catch (err) {
    console.error("[recommend] failed:", err);
    return Response.json({ error: "Couldn't get a recommendation, try again" }, { status: 502 });
  }
}
