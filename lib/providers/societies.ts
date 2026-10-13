// Real society events: scrape each society's SU pages, then have Claude turn the text into events.
// Server-side only (uses ANTHROPIC_API_KEY).
//
// Claude (Haiku: this is simple reading) returns three kinds of event:
//   - one-off:     a dated event ("13/10/2026 | 19:00 - 21:15", or one of a listed set of dates)
//   - weekly:      a regular session written in the description ("Wednesday meetups 6-8PM")
//   - fortnightly: "every other Monday", anchored on a date the text gives
// Repeating ones are kept as rules and expanded into real dates, but only within the next
// HORIZON_DAYS days: further out, the society page is too likely to have changed.
//
// A society whose page can't be fetched (network error, 404, bot check) falls back to its mock
// events. A page that loads but lists nothing gives no events: that's a real answer.
//
// Nothing is guessed silently: an unstated cost leaves `free` unset, an unstated end sets
// `endEstimated`, and a session with a day but no time is kept with `timeTBC` + `partOfDay`.

import { BUILDINGS, type BuildingId } from "../buildings";
import { askClaudeJson, FAST_MODEL, makeDebug } from "../claude-json";
import { londonDateKey } from "../gaps";
import { addDays, dayOfWeek, isDateKey, isWallTime, londonIso, londonTodayKey } from "../london-time";
import { MOCK_SOCIETY_EVENTS } from "../mock";
import { societyPageText, toSlug } from "../societies/su-site";
import type { DateKey, IsoDateTime, PartOfDay, Society, SocietyEvent, WallTime } from "../types";
import type { EventsProvider } from "./types";

const debug = makeDebug("societies");
const CACHE_MS = 60 * 60 * 1000; // 1 hour
const HORIZON_DAYS = 14;
/** SocietyEvent needs an end. When the text gives none, assume an hour (not shown as a fact anywhere). */
const DEFAULT_LENGTH_MINS = 60;
const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
const COSTS = ["free-food", "free", "paid", "unknown"] as const;
type Cost = (typeof COSTS)[number];
const PARTS_OF_DAY = ["morning", "afternoon", "evening"] as const;
/** Rough window used for a time-TBC session, so it still overlaps the right gaps. Always flagged as estimated. */
const PART_OF_DAY_WINDOW: Record<PartOfDay, [WallTime, WallTime]> = {
  morning: ["09:00", "12:00"],
  afternoon: ["12:00", "17:00"],
  evening: ["18:00", "21:00"],
};

/** The society's SU page couldn't be fetched. Only this falls back to mock events. */
class PageUnavailableError extends Error {
  constructor(slug: string, cause: unknown) {
    super(`SU page for "${slug}" unavailable`, { cause });
    this.name = "PageUnavailableError";
  }
}

/** An event as Claude described it, before weekly ones are expanded into dates. */
interface EventRule {
  society: Society;
  title: string;
  /** Set for one-off events. */
  date?: DateKey;
  /** Set for weekly events. 1 = Monday … 7 = Sunday. */
  weekday?: number;
  /** Set for fortnightly events: one date it happens on. It repeats every 14 days either side. */
  anchor?: DateKey;
  startTime: WallTime;
  endTime: WallTime;
  /** The page gave no end time; endTime is start + DEFAULT_LENGTH_MINS. */
  endEstimated: boolean;
  /** Set when the page gives a day but no time; start/endTime are then the PART_OF_DAY_WINDOW. */
  partOfDay?: PartOfDay;
  /** As written on the page, or "" if it doesn't say. */
  venue: string;
  buildingId?: BuildingId;
  cost: Cost;
  membersOnly: boolean;
  tags: string[];
  url?: string;
}

// ---------- Claude extraction ----------

const EVENT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: ["one-off", "weekly", "fortnightly"] },
    date: {
      anyOf: [{ type: "string", description: "YYYY-MM-DD: the one-off's date, or a fortnightly session's anchor date" }, { type: "null" }],
    },
    weekday: { anyOf: [{ type: "integer", enum: [1, 2, 3, 4, 5, 6, 7] }, { type: "null" }] },
    startTime: { anyOf: [{ type: "string", description: "24-hour HH:MM" }, { type: "null" }] },
    partOfDay: { anyOf: [{ type: "string", enum: PARTS_OF_DAY }, { type: "null" }] },
    listedDates: {
      type: "array",
      items: { type: "string", description: "YYYY-MM-DD" },
      description: "Weekly/fortnightly only: every date the text lists for this session, in or out of range. Empty if none listed.",
    },
    endTime: { anyOf: [{ type: "string", description: "24-hour HH:MM" }, { type: "null" }] },
    venue: { anyOf: [{ type: "string" }, { type: "null" }] },
    buildingId: { anyOf: [{ type: "string", enum: BUILDING_IDS }, { type: "null" }] },
    cost: { type: "string", enum: COSTS },
    membersOnly: { type: "boolean" },
    tags: { type: "array", items: { type: "string" }, description: "1-3 short lowercase topic tags" },
    url: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["title", "kind", "date", "weekday", "startTime", "partOfDay", "listedDates", "endTime", "venue", "buildingId", "cost", "membersOnly", "tags", "url"],
  additionalProperties: false,
} as const;

const EVENTS_SCHEMA = {
  type: "object",
  properties: { events: { type: "array", items: EVENT_SCHEMA } },
  required: ["events"],
  additionalProperties: false,
};

const BUILDING_LIST = BUILDING_IDS.map((id) => `- ${id}: ${BUILDINGS[id].name}`).join("\n");

function prompt(society: Society, today: DateKey, text: { about: string; events: string }): string {
  const last = addDays(today, HORIZON_DAYS - 1);
  return `Below is text from the UCL Students' Union pages of "${society.name}". Today is ${today} (London, ${WEEKDAYS[dayOfWeek(today) - 1]}).

List the society's events between ${today} and ${last} that a student could turn up to.

Rules:
- kind "one-off": a dated event. Set date (YYYY-MM-DD; the SU site writes dates as DD/MM/YYYY) and weekday null. Skip anything outside ${today} to ${last}.
- If the text lists the dates of a repeating session (e.g. "Jam dates: October 5th, October 19th, November 2nd"), give it kind "weekly" or "fortnightly" and copy EVERY listed date into listedDates (YYYY-MM-DD), even ones outside the range. The listed dates are the only days it happens. Dates without a year mean the next one on or after today. listedDates is [] for everything else.
- kind "weekly": a session the text says happens every week, e.g. "Wednesday meetups 6-8PM", with no dates listed. Set weekday (1 = Monday … 7 = Sunday) and date null.
- kind "fortnightly": "every other <day>" or "fortnightly" with no dates listed. Set weekday, and set date to one specific date the text says it happens on (the anchor). If the text gives no such date, leave the session out: never guess which week.
- Times in 24-hour HH:MM. endTime null if not stated. partOfDay null when there's a start time.
- A one-off with no start time: leave it out.
- A weekly or fortnightly session with a day but no time (e.g. "every Thursday evening"): startTime null and partOfDay "morning", "afternoon" or "evening" as written. If the text gives neither a time nor a part of day, leave it out. Never make up a time.
- A social held straight "after" another session (e.g. drinks after Thursday evening rehearsals) is its own event on the same day(s), with the same part of day and startTime null.
- venue: exactly as written, or null if not stated or "TBD". buildingId: the matching UCL building from this list, or null if none fits; don't guess.
${BUILDING_LIST}
- cost: only from what the text says. "free-food" if it says food or drinks are provided free (free pizza, refreshments); "free" if it says free to attend (including "grab a free ticket"); "paid" if it names a ticket price or a paid membership. Otherwise "unknown".
- membersOnly: true only if the text says the event (or the society's events) are for members only or need membership. Otherwise false.
- url: the event's link from the events list, or null.
- If the same session appears on both pages, list it once (prefer the dated one-off).
- Only use what's written. Never invent events or fill in details. If there are none, return an empty list.

=== Events page ===
${text.events}

=== Society page ===
${text.about}`;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");

/** "9:00" → "09:00". Claude sometimes drops the leading zero. */
function normaliseTime(x: unknown): string {
  const s = str(x);
  return /^\d:\d\d$/.test(s) ? `0${s}` : s;
}

function plusMins(time: WallTime, mins: number): WallTime {
  const total = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function extractRules(society: Society): Promise<EventRule[]> {
  const text = await societyPageText(society.slug).catch((err) => {
    throw new PageUnavailableError(society.slug, err);
  });
  const today = londonTodayKey();
  const parsed = (await askClaudeJson(
    `society ${society.slug}`,
    [{ type: "text", text: prompt(society, today, text) }],
    EVENTS_SCHEMA,
    "low", // reading a short list of events doesn't need much thinking
    FAST_MODEL,
  )) as { events?: unknown };
  const raw = Array.isArray(parsed.events) ? parsed.events : [];

  const last = addDays(today, HORIZON_DAYS - 1);
  const rules: EventRule[] = [];
  for (const item of raw) {
    const e = item as Record<string, unknown>;
    const repeating = e.kind === "weekly" || e.kind === "fortnightly";
    const partOfDay = PARTS_OF_DAY.find((p) => p === e.partOfDay);
    let startTime = normaliseTime(e.startTime);
    let endTime: WallTime;
    let endEstimated: boolean;
    let tbc: PartOfDay | undefined;
    if (isWallTime(startTime)) {
      const endRaw = normaliseTime(e.endTime);
      endEstimated = !isWallTime(endRaw);
      // Past midnight ("17:30 - 01:00") gets cut at 23:59: we only care about daytime gaps anyway.
      endTime = isWallTime(endRaw) ? (endRaw > startTime ? endRaw : "23:59") : plusMins(startTime, DEFAULT_LENGTH_MINS);
    } else if (repeating && partOfDay) {
      [startTime, endTime] = PART_OF_DAY_WINDOW[partOfDay];
      endEstimated = true;
      tbc = partOfDay;
    } else continue;

    let whens: Pick<EventRule, "date" | "weekday" | "anchor">[];
    const date = str(e.date);
    const weekday = Number(e.weekday);
    const listed = Array.isArray(e.listedDates) ? e.listedDates.map(str).filter(isDateKey) : [];
    // The page lists the actual dates: use only those, never the repeat pattern
    // ("every other Tuesday" with dates 6 Oct, 27 Oct is not 20 Oct).
    if (repeating && listed.length > 0) whens = listed.filter((d) => d >= today && d <= last).map((d) => ({ date: d }));
    else if (e.kind === "one-off" && isDateKey(date) && date >= today && date <= last) whens = [{ date }];
    else if (e.kind === "weekly" && Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) whens = [{ weekday }];
    // The anchor's own weekday wins over the weekday field, so the two can't disagree.
    else if (e.kind === "fortnightly" && isDateKey(date)) whens = [{ anchor: date }];
    else continue;

    const cost = COSTS.includes(e.cost as Cost) ? (e.cost as Cost) : "unknown";
    const url = str(e.url);
    for (const when of whens) {
      rules.push({
        society,
        title: str(e.title) || `${society.name} event`,
        ...when,
        startTime,
        endTime,
        endEstimated,
        ...(tbc ? { partOfDay: tbc } : {}),
        venue: str(e.venue),
        ...(typeof e.buildingId === "string" && e.buildingId in BUILDINGS ? { buildingId: e.buildingId as BuildingId } : {}),
        cost,
        membersOnly: e.membersOnly === true,
        tags: Array.isArray(e.tags) ? e.tags.map(str).filter(Boolean).slice(0, 3) : [],
        ...(url.startsWith("https://") ? { url } : {}),
      });
    }
  }
  const weekly = rules.filter((r) => r.weekday).length;
  const fortnightly = rules.filter((r) => r.anchor).length;
  const tbc = rules.filter((r) => r.partOfDay).length;
  debug(`${society.slug}: ${rules.length} events (${weekly} weekly, ${fortnightly} fortnightly, ${tbc} time TBC)`);
  return rules;
}

// ---------- Cache ----------

// Keeps the promise, not the result, so the parallel /api/recommend calls for one day share a
// single scrape and Claude call per society. Lives as long as the server instance does.
// Keyed by day too, because the horizon starts today. An empty list is cached like any other answer.
const cache = new Map<string, { at: number; rules: Promise<EventRule[]> }>();

function rulesFor(society: Society): Promise<EventRule[]> {
  const key = `${society.slug}:${londonTodayKey()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;
  const rules = extractRules(society);
  cache.set(key, { at: Date.now(), rules });
  // Don't cache failures: the next request should retry.
  rules.catch(() => {
    if (cache.get(key)?.rules === rules) cache.delete(key);
  });
  return rules;
}

// ---------- Rules → events ----------

/** Short stable hash, so an event keeps the same id between calls. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function toEvent(rule: EventRule, date: DateKey): SocietyEvent {
  const start = londonIso(date, rule.startTime);
  const costTags = rule.cost === "free-food" ? ["free-food", "free"] : rule.cost === "unknown" ? [] : [rule.cost];
  const repeatTag = rule.weekday ? ["weekly"] : rule.anchor ? ["fortnightly"] : [];
  return {
    id: `soc-${rule.society.slug}-${date}-${rule.startTime.replace(":", "")}-${hash(rule.title)}`,
    society: rule.society.name,
    title: rule.title,
    start,
    end: londonIso(date, rule.endTime),
    venue: rule.venue,
    ...(rule.buildingId ? { buildingId: rule.buildingId } : {}),
    ...(rule.url ? { url: rule.url } : {}),
    tags: [...new Set([...costTags, ...rule.tags, ...repeatTag])],
    ...(rule.cost === "unknown" ? {} : { free: rule.cost !== "paid" }),
    ...(rule.membersOnly ? { membersOnly: true as const } : {}),
    ...(rule.endEstimated ? { endEstimated: true as const } : {}),
    ...(rule.partOfDay ? { timeTBC: true as const, partOfDay: rule.partOfDay } : {}),
  };
}

const daysApart = (a: DateKey, b: DateKey) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

function happensOn(rule: EventRule, day: DateKey): boolean {
  if (rule.date) return rule.date === day;
  if (rule.weekday) return rule.weekday === dayOfWeek(day);
  if (rule.anchor) return daysApart(day, rule.anchor) % 14 === 0; // -0 === 0, so dates before the anchor work too
  return false;
}

/** Every London day touched by [start, end], clipped to the next HORIZON_DAYS days. */
function daysBetween(start: IsoDateTime, end: IsoDateTime): DateKey[] {
  const today = londonTodayKey();
  const first = londonDateKey(start) > today ? londonDateKey(start) : today;
  const lastWanted = londonDateKey(end);
  const lastHorizon = addDays(today, HORIZON_DAYS - 1);
  const last = lastWanted < lastHorizon ? lastWanted : lastHorizon;
  const days: DateKey[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

function sameEvent(a: SocietyEvent, b: SocietyEvent): boolean {
  if (Date.parse(a.start) !== Date.parse(b.start)) return false;
  // Same society, same start: one session listed twice. Except time-TBC ones, whose start is
  // only a rough window that two different sessions ("Big Band", "Big Band Drinks") can share.
  if (a.society === b.society && !a.timeTBC && !b.timeTBC) return true;
  const ta = normTitle(a.title);
  const tb = normTitle(b.title);
  return ta === tb || (ta.length > 5 && tb.length > 5 && (ta.includes(tb) || tb.includes(ta)));
}

/** Dated one-offs with a link and a venue win over a repeating rule's copy of the same session. */
function richness(e: SocietyEvent): number {
  const repeating = e.tags.includes("weekly") || e.tags.includes("fortnightly");
  return (e.url ? 4 : 0) + (repeating ? 0 : 2) + (e.venue ? 1 : 0);
}

export function dedupeEvents(events: SocietyEvent[]): SocietyEvent[] {
  const kept: SocietyEvent[] = [];
  for (const e of [...events].sort((a, b) => richness(b) - richness(a))) {
    if (!kept.some((k) => sameEvent(k, e))) kept.push(e);
  }
  return kept.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

// ---------- Provider ----------

const overlaps = (ev: SocietyEvent, s: number, e: number) => Date.parse(ev.start) < e && Date.parse(ev.end) > s;

/** The mock week's events for this society, if it has any. Matched on slug, so "UCL Chess Society" = chess-society. */
function mockEventsFor(society: Society): SocietyEvent[] {
  return MOCK_SOCIETY_EVENTS.filter((ev) => toSlug(ev.society) === society.slug);
}

/**
 * One society's events in the window. Never throws. Mock events only if its page couldn't be
 * fetched; if Claude fails, the student just sees no events for that society.
 */
async function eventsForSociety(society: Society, start: IsoDateTime, end: IsoDateTime): Promise<SocietyEvent[]> {
  const s = Date.parse(start);
  const e = Date.parse(end);
  try {
    const rules = await rulesFor(society);
    const events = daysBetween(start, end).flatMap((day) => rules.filter((r) => happensOn(r, day)).map((r) => toEvent(r, day)));
    return events.filter((ev) => overlaps(ev, s, e));
  } catch (err) {
    if (err instanceof PageUnavailableError) {
      console.error(`[societies] ${society.slug}: page unavailable, using mock:`, err.cause);
      return mockEventsFor(society).filter((ev) => overlaps(ev, s, e));
    }
    console.error(`[societies] ${society.slug}: reading the page failed, no events:`, err);
    return [];
  }
}

/**
 * Events from the given societies' SU pages. Each society falls back to its own mock events
 * (if it has any) only when its page can't be fetched or is blocked.
 */
export function societyEventsProvider(societies: Society[]): EventsProvider {
  return {
    async getEvents(start, end) {
      const perSociety = await Promise.all(societies.map((soc) => eventsForSociety(soc, start, end)));
      return dedupeEvents(perSociety.flat());
    },
  };
}
