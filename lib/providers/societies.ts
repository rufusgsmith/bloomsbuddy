// Real society events: scrape each society's SU pages, then have Claude turn the text into events.
// Server-side only (uses ANTHROPIC_API_KEY).
//
// Claude returns two kinds of event:
//   - one-off: a dated event from the events page ("13/10/2026 | 19:00 - 21:15")
//   - weekly:  a regular session written in the description ("Wednesday meetups 6-8PM")
// Weekly ones are kept as rules and expanded for whatever window is asked for, so they show up
// in any week of term, not just the next few days.

import { BUILDINGS, type BuildingId } from "../buildings";
import { askClaudeJson, makeDebug } from "../claude-json";
import { londonDateKey } from "../gaps";
import { addDays, dayOfWeek, isDateKey, isWallTime, londonIso, londonTodayKey } from "../london-time";
import { societyPageText } from "../societies/su-site";
import type { DateKey, IsoDateTime, Society, SocietyEvent, WallTime } from "../types";
import type { EventsProvider } from "./types";

const debug = makeDebug("societies");
const CACHE_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_LENGTH_MINS = 60;
const UNKNOWN_VENUE = "Venue on the SU page";
const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
const COSTS = ["free-food", "free", "paid", "unknown"] as const;
type Cost = (typeof COSTS)[number];

/** An event as Claude described it, before weekly ones are expanded into dates. */
interface EventRule {
  society: Society;
  title: string;
  /** Set for one-off events. */
  date?: DateKey;
  /** Set for weekly events. 1 = Monday … 7 = Sunday. */
  weekday?: number;
  startTime: WallTime;
  endTime: WallTime;
  venue: string;
  buildingId?: BuildingId;
  cost: Cost;
  tags: string[];
  url?: string;
}

// ---------- Claude extraction ----------

const EVENT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: ["one-off", "weekly"] },
    date: { anyOf: [{ type: "string", description: "YYYY-MM-DD, for one-off events" }, { type: "null" }] },
    weekday: { anyOf: [{ type: "integer", enum: [1, 2, 3, 4, 5, 6, 7] }, { type: "null" }] },
    startTime: { type: "string", description: "24-hour HH:MM" },
    endTime: { anyOf: [{ type: "string", description: "24-hour HH:MM" }, { type: "null" }] },
    venue: { anyOf: [{ type: "string" }, { type: "null" }] },
    buildingId: { anyOf: [{ type: "string", enum: BUILDING_IDS }, { type: "null" }] },
    cost: { type: "string", enum: COSTS },
    tags: { type: "array", items: { type: "string" }, description: "1-3 short lowercase topic tags" },
    url: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["title", "kind", "date", "weekday", "startTime", "endTime", "venue", "buildingId", "cost", "tags", "url"],
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
  return `Below is text from the UCL Students' Union pages of "${society.name}". Today is ${today} (London).

List the society's upcoming events that a student could turn up to.

Rules:
- kind "one-off": a dated event. Set date (YYYY-MM-DD; the SU site writes dates as DD/MM/YYYY) and weekday null. Skip anything before today.
- kind "weekly": a regular session the description says happens every week, e.g. "Wednesday meetups 6-8PM". Set weekday (1 = Monday … 7 = Sunday) and date null. Only include it if a weekday AND a start time are written down.
- Times in 24-hour HH:MM. endTime null if not stated. Skip events with no start time.
- venue: as written, or null if not stated or "TBD". buildingId: the matching UCL building from this list, or null if none fits; don't guess.
${BUILDING_LIST}
- cost: "free-food" if food or drinks are provided free (free pizza, refreshments); "free" if free to attend (including "grab a free ticket"); "paid" if it needs a ticket price or a paid membership; otherwise "unknown".
- url: the event's link from the events list, or null.
- If the same session appears on both pages, list it once (prefer the dated one-off).
- Only use what's written. Never invent events. If there are none, return an empty list.

=== Events page ===
${text.events}

=== Society page ===
${text.about}`;
}

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
  const text = await societyPageText(society.slug);
  const today = londonTodayKey();
  const parsed = (await askClaudeJson(
    `society ${society.slug}`,
    [{ type: "text", text: prompt(society, today, text) }],
    EVENTS_SCHEMA,
    "low", // reading a short list of events doesn't need much thinking
  )) as { events?: unknown };
  const raw = Array.isArray(parsed.events) ? parsed.events : [];

  const rules: EventRule[] = [];
  for (const item of raw) {
    const e = item as Record<string, unknown>;
    const startTime = normaliseTime(e.startTime);
    if (!isWallTime(startTime)) continue;
    const endRaw = normaliseTime(e.endTime);
    // Past midnight ("17:30 - 01:00") gets cut at 23:59: we only care about daytime gaps anyway.
    const endTime = isWallTime(endRaw) ? (endRaw > startTime ? endRaw : "23:59") : plusMins(startTime, DEFAULT_LENGTH_MINS);

    let when: Pick<EventRule, "date" | "weekday">;
    const date = str(e.date);
    const weekday = Number(e.weekday);
    if (e.kind === "one-off" && isDateKey(date) && date >= today) when = { date };
    else if (e.kind === "weekly" && Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) when = { weekday };
    else continue;

    const cost = COSTS.includes(e.cost as Cost) ? (e.cost as Cost) : "unknown";
    const url = str(e.url);
    rules.push({
      society,
      title: str(e.title) || `${society.name} event`,
      ...when,
      startTime,
      endTime,
      venue: str(e.venue) || UNKNOWN_VENUE,
      ...(typeof e.buildingId === "string" && e.buildingId in BUILDINGS ? { buildingId: e.buildingId as BuildingId } : {}),
      cost,
      tags: Array.isArray(e.tags) ? e.tags.map(str).filter(Boolean).slice(0, 3) : [],
      ...(url.startsWith("https://") ? { url } : {}),
    });
  }
  debug(`${society.slug}: ${rules.length} events (${rules.filter((r) => r.weekday).length} weekly)`);
  return rules;
}

// ---------- Cache ----------

// Keeps the promise, not the result, so the parallel /api/recommend calls for one day share a
// single scrape and Claude call per society. Lives as long as the server instance does.
const cache = new Map<string, { at: number; rules: Promise<EventRule[]> }>();

function rulesFor(society: Society): Promise<EventRule[]> {
  const hit = cache.get(society.slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;
  const rules = extractRules(society);
  cache.set(society.slug, { at: Date.now(), rules });
  // Don't cache failures: the next request should retry.
  rules.catch(() => {
    if (cache.get(society.slug)?.rules === rules) cache.delete(society.slug);
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
  return {
    id: `soc-${rule.society.slug}-${date}-${rule.startTime.replace(":", "")}-${hash(rule.title)}`,
    society: rule.society.name,
    title: rule.title,
    start,
    end: londonIso(date, rule.endTime),
    venue: rule.venue,
    ...(rule.buildingId ? { buildingId: rule.buildingId } : {}),
    ...(rule.url ? { url: rule.url } : {}),
    tags: [...new Set([...costTags, ...rule.tags, ...(rule.weekday ? ["weekly"] : [])])],
    free: rule.cost === "free" || rule.cost === "free-food",
  };
}

/** Every London day touched by [start, end]. */
function daysBetween(start: IsoDateTime, end: IsoDateTime): DateKey[] {
  const days: DateKey[] = [];
  const last = londonDateKey(end);
  for (let d = londonDateKey(start); d <= last && days.length < 366; d = addDays(d, 1)) days.push(d);
  return days;
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

function sameEvent(a: SocietyEvent, b: SocietyEvent): boolean {
  if (Date.parse(a.start) !== Date.parse(b.start)) return false;
  if (a.society === b.society) return true;
  const ta = normTitle(a.title);
  const tb = normTitle(b.title);
  return ta === tb || (ta.length > 5 && tb.length > 5 && (ta.includes(tb) || tb.includes(ta)));
}

/** Dated one-offs with a link and a real venue win over a weekly rule's copy of the same session. */
function richness(e: SocietyEvent): number {
  return (e.url ? 4 : 0) + (e.tags.includes("weekly") ? 0 : 2) + (e.venue === UNKNOWN_VENUE ? 0 : 1);
}

export function dedupeEvents(events: SocietyEvent[]): SocietyEvent[] {
  const kept: SocietyEvent[] = [];
  for (const e of [...events].sort((a, b) => richness(b) - richness(a))) {
    if (!kept.some((k) => sameEvent(k, e))) kept.push(e);
  }
  return kept.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/**
 * Events from the given societies' SU pages. A society that fails is logged and skipped;
 * if they all fail it throws, so the caller can fall back to mock data.
 */
export function societyEventsProvider(societies: Society[]): EventsProvider {
  return {
    async getEvents(start, end) {
      const results = await Promise.allSettled(societies.map(rulesFor));
      const rules: EventRule[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") rules.push(...r.value);
        else console.error(`[societies] ${societies[i].slug} failed:`, r.reason);
      });
      if (societies.length > 0 && results.every((r) => r.status === "rejected")) {
        throw new Error("Every society failed to load");
      }

      const s = Date.parse(start);
      const e = Date.parse(end);
      const events: SocietyEvent[] = [];
      for (const day of daysBetween(start, end)) {
        for (const rule of rules) {
          if (rule.date === day || rule.weekday === dayOfWeek(day)) events.push(toEvent(rule, day));
        }
      }
      return dedupeEvents(events.filter((ev) => Date.parse(ev.start) < e && Date.parse(ev.end) > s));
    },
  };
}
