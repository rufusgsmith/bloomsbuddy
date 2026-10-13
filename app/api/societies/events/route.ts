// GET /api/societies/events?slug=chess-society&name=Chess Society  →  { events: SocietyEvent[] }
// One society's events from now until the end of the 14-day horizon. The Societies tab calls
// this once per society, so a slow or broken society page never holds up the others.
import { addDays, londonIso, londonTodayKey } from "@/lib/london-time";
import { eventsForSociety } from "@/lib/providers";
import { isSlug } from "@/lib/societies/slug";

/** Matches HORIZON_DAYS in lib/providers/societies.ts: today plus the next 13 days. */
const HORIZON_DAYS = 14;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug")?.trim() ?? "";
  const name = params.get("name")?.trim() ?? "";
  if (!isSlug(slug) || !name || name.length > 100) {
    return Response.json({ error: "Give me a society slug and name" }, { status: 400 });
  }
  try {
    const start = new Date().toISOString();
    const end = londonIso(addDays(londonTodayKey(), HORIZON_DAYS), "00:00");
    const events = await eventsForSociety({ slug, name }).getEvents(start, end);
    return Response.json({ events });
  } catch (err) {
    console.error(`[societies/events] ${slug} failed:`, err);
    return Response.json({ error: "Couldn't load this society's events" }, { status: 502 });
  }
}
