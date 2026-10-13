// GET /api/societies/events?slug=chess-society&name=Chess Society&until=2026-12-11  →  { events: SocietyEvent[] }
// One society's events from now to the end of `until` (a London day, normally the end of term;
// defaults to UCL's term end). The Societies tab calls this once per society, so a slow or
// broken society page never holds up the others.
import { addDays, isDateKey, londonIso, londonTodayKey } from "@/lib/london-time";
import { eventsForSociety } from "@/lib/providers";
import { isSlug } from "@/lib/societies/slug";
import { termEndKey } from "@/lib/term";

/** Never look further ahead than this, whatever `until` says. */
const MAX_DAYS_AHEAD = 180;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug")?.trim() ?? "";
  const name = params.get("name")?.trim() ?? "";
  const until = params.get("until")?.trim();
  if (!isSlug(slug) || !name || name.length > 100) {
    return Response.json({ error: "Give me a society slug and name" }, { status: 400 });
  }
  if (until !== undefined && !isDateKey(until)) {
    return Response.json({ error: "`until` must be a YYYY-MM-DD date" }, { status: 400 });
  }
  try {
    const limit = addDays(londonTodayKey(), MAX_DAYS_AHEAD);
    const lastDay = until ? (until < limit ? until : limit) : termEndKey();
    const start = new Date().toISOString();
    const end = londonIso(addDays(lastDay, 1), "00:00");
    const events = await eventsForSociety({ slug, name }).getEvents(start, end);
    return Response.json({ events });
  } catch (err) {
    console.error(`[societies/events] ${slug} failed:`, err);
    return Response.json({ error: "Couldn't load this society's events" }, { status: 502 });
  }
}
