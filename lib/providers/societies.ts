// Real society events: each society's SU /events page, read directly (see lib/societies/su-site.ts).
// Server-side only. No Claude call and no cache: every request scrapes afresh, so a refresh
// shows what's on the SU site right now.
//
// A society whose page can't be fetched (network error, bot check) falls back to its mock
// events, if it has any. A page that loads but lists nothing gives no events: that's a real answer.

import { londonDateKey } from "../gaps";
import { londonTodayKey } from "../london-time";
import { mockSocietyEvents } from "../mock";
import { societyEvents, toSlug } from "../societies/su-site";
import type { Society, SocietyEvent } from "../types";
import type { EventsProvider } from "./types";

// The parallel /api/recommend calls for one day arrive together. Sharing the in-flight
// promise gives them one scrape per society instead of one each.
const inFlight = new Map<string, Promise<SocietyEvent[]>>();

/** Scrapes the London days covering [s, e] (ms), never before today. */
function scrape(society: Society, s: number, e: number): Promise<SocietyEvent[]> {
  const today = londonTodayKey();
  const startDay = londonDateKey(new Date(s).toISOString());
  const first = startDay > today ? startDay : today;
  const last = londonDateKey(new Date(e).toISOString());
  const key = `${society.slug}:${first}:${last}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const result = societyEvents({ slug: society.slug, name: society.name }, first, last).finally(() => inFlight.delete(key));
  inFlight.set(key, result);
  return result;
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The same event listed by two societies (e.g. a "Fleming Soc X CSS" collab) shows once. */
function sameEvent(a: SocietyEvent, b: SocietyEvent): boolean {
  if (a.url && a.url === b.url) return true;
  return Date.parse(a.start) === Date.parse(b.start) && normTitle(a.title) === normTitle(b.title);
}

export function dedupeEvents(events: SocietyEvent[]): SocietyEvent[] {
  const kept: SocietyEvent[] = [];
  for (const e of events) if (!kept.some((k) => sameEvent(k, e))) kept.push(e);
  return kept.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const overlaps = (ev: SocietyEvent, s: number, e: number) => Date.parse(ev.start) < e && Date.parse(ev.end) > s;

/** The mock week's events for this society, if it has any. Matched on slug, so "UCL Chess Society" = chess-society. */
function mockEventsFor(society: Society): SocietyEvent[] {
  return mockSocietyEvents().filter((ev) => toSlug(ev.society) === society.slug);
}

/** One society's events in the window. Never throws: a failed scrape gives its mock events. */
async function eventsForSociety(society: Society, s: number, e: number): Promise<SocietyEvent[]> {
  try {
    return (await scrape(society, s, e)).filter((ev) => overlaps(ev, s, e));
  } catch (err) {
    console.error(`[societies] ${society.slug}: SU page unavailable, using mock:`, err);
    return mockEventsFor(society).filter((ev) => overlaps(ev, s, e));
  }
}

/** Events from the given societies' SU pages, scraped on every call. */
export function societyEventsProvider(societies: Society[]): EventsProvider {
  return {
    async getEvents(start, end) {
      const s = Date.parse(start);
      const e = Date.parse(end);
      const perSociety = await Promise.all(societies.map((soc) => eventsForSociety(soc, s, e)));
      return dedupeEvents(perSociety.flat());
    },
  };
}
