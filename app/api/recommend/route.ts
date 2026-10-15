// POST /api/recommend  body: { gap: Gap, dayGaps?: Gap[], deadlines?: Deadline[] }  →  Recommendation
// dayGaps (the rest of that day's gaps) is optional context so Claude can plan around longer gaps.
// deadlines are the student's own (from onboarding). When sent, even empty, they replace the mock ones.
// societies are the student's SU societies; outside demo mode their real events replace the mock ones.
// home ({ label, lat, lng }) is where the student lives, so Claude can suggest popping back.
// todos are the To-do tab's open and repeating items; recommendForGap keeps the ones that fit the gap.
// addedEventIds are society event ids already on the student's calendar: fixed plans, never suggested again.
import { isLocation } from "@/lib/location";
import { recommendForGap } from "@/lib/recommend/recommend";
import { isSlug } from "@/lib/societies/su-site";
import { isTodo, migrateTodo } from "@/lib/todos";
import type { Deadline, Gap, HomeLocation, Society } from "@/lib/types";

/** Each society costs a scrape and a Claude call (cached for an hour), so cap how many we accept. */
const MAX_SOCIETIES = 10;
/** Keeps the get_todos result (and the prompt) small. */
const MAX_TODOS = 30;
const MAX_ADDED_EVENTS = 100;

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

function isSociety(x: unknown): x is Society {
  const s = x as Partial<Society> | null;
  return isSlug(s?.slug) && typeof s.name === "string";
}

/** London and the commuter belt. Our tube estimate means nothing further out, so we ignore it. */
function isHomeLocation(x: unknown): x is HomeLocation {
  const h = x as Partial<HomeLocation> | null;
  return (
    typeof h?.label === "string" &&
    h.label.length <= 60 &&
    typeof h.lat === "number" &&
    typeof h.lng === "number" &&
    h.lat > 51.0 &&
    h.lat < 52.2 &&
    h.lng > -1.2 &&
    h.lng < 0.8
  );
}

export async function POST(request: Request) {
  let body: { gap?: unknown; dayGaps?: unknown; deadlines?: unknown; societies?: unknown; home?: unknown; todos?: unknown; addedEventIds?: unknown };
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
    // A malformed location is dropped, not the whole deadline.
    const deadlines = Array.isArray(body.deadlines)
      ? body.deadlines
          .filter(isDeadline)
          .map(({ location, ...d }) => (isLocation(location) ? { ...d, location } : d))
      : undefined;
    const societies = Array.isArray(body.societies)
      ? body.societies.filter(isSociety).slice(0, MAX_SOCIETIES)
      : undefined;
    // A home outside the commuter belt is ignored (no home picks) rather than rejected.
    const home = isHomeLocation(body.home) ? body.home : undefined;
    const todos = Array.isArray(body.todos)
      ? body.todos.map(migrateTodo).filter(isTodo).filter((t) => !t.done || t.repeat).slice(0, MAX_TODOS)
      : undefined;
    const addedEventIds = Array.isArray(body.addedEventIds)
      ? body.addedEventIds.filter((id): id is string => typeof id === "string" && id.length <= 200).slice(0, MAX_ADDED_EVENTS)
      : undefined;
    return Response.json(await recommendForGap(body.gap, dayGaps, { deadlines, societies, home, todos, addedEventIds }));
  } catch (err) {
    console.error("[recommend] failed:", err);
    return Response.json({ error: "Couldn't get a recommendation, try again" }, { status: 502 });
  }
}
