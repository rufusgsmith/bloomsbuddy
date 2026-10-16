// Fetching and reading UCL Students' Union society pages. Server-side only. No Claude:
// the pages are structured enough to read directly, so this costs no API tokens.
//
// Pages we read:
//   /clubs-societies/<slug>          only its <title>, for the society's name
//   /clubs-societies/<slug>/events   event cards: title, when, link. Followed through ?page=1, 2, …
//   each event's own page            venue, tags ("Free", "Alcohol Free", …) and exact start/end
//
// The card's "when" comes in four shapes:
//   17/10/2026                                   date only: no time anywhere, so it's timeTBC
//   19/10/2026 | 17:00                           start, no end (an hour, flagged endEstimated)
//   19/10/2026 | 17:00 - 21:00                   start and end the same day (an earlier end = next day)
//   08/11/2026 | 7:00 - 11/11/2026 | 18:00       an end on a later day (multi-day, past midnight)
//
// Every dated card on the /events pages is found. Weekly sessions written only in the
// society's description are not.

import * as cheerio from "cheerio";
import { BlockedError, isBotChallenge } from "../bot-check";
import { matchBuilding } from "../buildings";
import { addDays, isDateKey, isWallTime, londonIso } from "../london-time";
import type { DateKey, Society, SocietyEvent, WallTime } from "../types";
import { isSlug, toSlug } from "./slug";

export { isSlug, toSlug };

const ORIGIN = "https://studentsunionucl.org";
const BASE = `${ORIGIN}/clubs-societies/`;
const USER_AGENT = "Bloomsbuddy/0.1 (UCL student hackathon project; non-commercial)";
const TIMEOUT_MS = 8000;
/** Event pages fetched at once. A society can list a whole term of events. */
const DETAIL_CONCURRENCY = 6;
/** SocietyEvent needs an end. When nothing gives one, assume an hour (flagged endEstimated). */
const DEFAULT_LENGTH_MINS = 60;
/** /events?page=N pages read at most. Hiking Club's whole term fits on the first. */
const MAX_PAGES = 10;

/**
 * The page's HTML, or null if it doesn't exist. Throws BlockedError on a bot check,
 * and a plain Error on network errors and other bad statuses.
 */
async function fetchSuPage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    // Never let Next cache an SU page: a refresh should show what's on the site right now.
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  const html = await res.text();
  if (isBotChallenge(res.status, html)) throw new BlockedError(url);
  if (!res.ok) throw new Error(`SU page ${url} returned ${res.status}`);
  return html;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Chess Society | Students Union UCL" → "Chess Society". */
function pageName(html: string): string {
  const $ = cheerio.load(html);
  return clean($("title").text().split("|")[0] ?? "");
}

/** Checks a society page exists and reads its name. Null if there's no page at that slug. */
export async function lookupSociety(slug: string): Promise<Society | null> {
  if (!isSlug(slug)) return null;
  const html = await fetchSuPage(BASE + slug);
  return html ? { slug, name: pageName(html) || slug } : null;
}

// ---------- Events ----------

/** When an event happens. No start = no time given (timeTBC). An end without endDate is on `date`. */
interface When {
  date: DateKey;
  start?: WallTime;
  endDate?: DateKey;
  end?: WallTime;
}

interface Card extends When {
  title: string;
  url?: string;
}

/** "9:00" → "09:00". */
const padTime = (t: string) => (/^\d:\d\d$/.test(t) ? `0${t}` : t);

/** "8/11/2026" → "2026-11-08", or undefined if it isn't a real date. */
function dmy(text: string): DateKey | undefined {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const key = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  return isDateKey(key) ? key : undefined;
}

const wall = (t: string | undefined) => {
  const padded = t ? padTime(t) : undefined;
  return padded && isWallTime(padded) ? padded : undefined;
};

/**
 * A card's "when" (see the shapes at the top of this file). Null without a date.
 * "08/11/2026 | 7:00 - 11/11/2026 | 18:00" → { date: "2026-11-08", start: "07:00", endDate: "2026-11-11", end: "18:00" }.
 */
function parseWhen(text: string): When | null {
  const D = String.raw`(\d{1,2}\/\d{1,2}\/\d{4})`;
  const T = String.raw`(\d{1,2}:\d{2})`;
  const m = text.match(new RegExp(String.raw`${D}(?:\s*\|\s*${T}(?:\s*-\s*(?:${D}\s*\|\s*)?${T})?)?`));
  const date = m ? dmy(m[1]) : undefined;
  if (!m || !date) return null;
  const start = wall(m[2]);
  if (!start) return { date };
  const endDate = m[3] ? dmy(m[3]) : undefined;
  const end = wall(m[4]);
  return { date, start, ...(end ? { end, ...(endDate && endDate !== date ? { endDate } : {}) } : {}) };
}

/** The event cards on one /events page. */
function eventCards(html: string): Card[] {
  const $ = cheerio.load(html);
  return $(".region-content .card, #main-content .card")
    .map((_, el): Card | null => {
      const card = $(el);
      const title = clean(card.find(".card_title_field").text());
      const when = parseWhen(clean(card.find(".card_subheading_1").text()));
      if (!title || !when) return null;
      const href = card.find("a.card-link").attr("href") ?? "";
      const url = href.startsWith("/") ? ORIGIN + href : href;
      return { title, ...when, ...(url.startsWith(`${ORIGIN}/`) ? { url } : {}) };
    })
    .get()
    .filter((c): c is Card => c !== null);
}

const cardKey = (c: Card) => c.url ?? `${c.date}|${c.title}`;

/**
 * Every card on the society's /events pages. The page is an infinite scroll (?page=1, 2, …) whose
 * "next" link only appears with JavaScript, so we ask for the next page until one adds nothing new.
 * Null if the society has no /events page.
 */
async function allEventCards(slug: string): Promise<Card[] | null> {
  const first = await fetchSuPage(`${BASE}${slug}/events`);
  if (!first) return null;
  const cards = new Map(eventCards(first).map((c) => [cardKey(c), c]));
  for (let page = 1; page < MAX_PAGES; page++) {
    let html: string | null;
    try {
      html = await fetchSuPage(`${BASE}${slug}/events?page=${page}`);
    } catch (err) {
      // Later pages are a bonus: the first page's cards still count.
      console.warn(`[su-site] ${slug} events page ${page} unreadable:`, err);
      break;
    }
    const fresh = html ? eventCards(html).filter((c) => !cards.has(cardKey(c))) : [];
    if (!fresh.length) break;
    for (const c of fresh) cards.set(cardKey(c), c);
  }
  return [...cards.values()];
}

interface Details {
  venue: string;
  free?: true;
  membersOnly?: true;
  /** The start and end from the page's <time datetime="…">, when it gives a time. */
  when?: Partial<When>;
}

/** "2026-11-08T07:00:00+00:00" → { date: "2026-11-08", time: "07:00" }. Date-only values give no time. */
function readDatetime(value: string | undefined): { date: DateKey; time?: WallTime } | null {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m || !isDateKey(m[1])) return null;
  return { date: m[1], ...(m[2] && isWallTime(m[2]) ? { time: m[2] } : {}) };
}

/**
 * The exact start and end from the event page's date field. It holds one <time> per end of the
 * range, with an offset that's London's (e.g. "2026-10-23T19:00:00+01:00"), so the wall time is
 * already London's.
 */
function pageWhen($: cheerio.CheerioAPI): Partial<When> | undefined {
  const times = $(".field--name-field-date-range time[datetime]")
    .map((_, el) => readDatetime($(el).attr("datetime")))
    .get()
    .filter((t): t is { date: DateKey; time?: WallTime } => t !== null);
  const [from, to] = times;
  if (!from?.time) return undefined;
  return {
    date: from.date,
    start: from.time,
    ...(to?.time ? { end: to.time, ...(to.date !== from.date ? { endDate: to.date } : {}) } : {}),
  };
}

/** Venue, tags and times from an event's own page. Empty if the page can't be read: the card still counts. */
async function eventDetails(url: string | undefined): Promise<Details> {
  if (!url) return { venue: "" };
  try {
    const html = await fetchSuPage(url);
    if (!html) return { venue: "" };
    const $ = cheerio.load(html);
    const venue = clean($(".field--name-field-event-venue").first().text());
    const tags = $(".field--name-field-event-tags li")
      .map((_, el) => clean($(el).text()).toLowerCase())
      .get();
    const body = clean($(".field--name-body").first().text());
    const when = pageWhen($);
    return {
      venue,
      // "Free" on its own; "Alcohol Free" is a different tag.
      ...(tags.includes("free") ? { free: true as const } : {}),
      ...(/\bmembers?[- ]only\b/i.test(body) ? { membersOnly: true as const } : {}),
      ...(when ? { when } : {}),
    };
  } catch (err) {
    console.warn(`[su-site] event page ${url} unreadable:`, err);
    return { venue: "" };
  }
}

function plusMins(time: WallTime, mins: number): WallTime {
  const total = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The last London day a card covers. A same-day end earlier than the start means past midnight. */
function lastDayOf(c: When): DateKey {
  if (c.endDate) return c.endDate;
  return c.start && c.end && c.end <= c.start ? addDays(c.date, 1) : c.date;
}

/** Start and end instants. No time: the whole day, flagged timeTBC. No end: an hour, flagged endEstimated. */
function instants(w: When): Pick<SocietyEvent, "start" | "end" | "endEstimated" | "timeTBC"> {
  if (!w.start) {
    return { start: londonIso(w.date, "00:00"), end: londonIso(addDays(w.date, 1), "00:00"), timeTBC: true };
  }
  if (!w.end) {
    return { start: londonIso(w.date, w.start), end: londonIso(w.date, plusMins(w.start, DEFAULT_LENGTH_MINS)), endEstimated: true };
  }
  return { start: londonIso(w.date, w.start), end: londonIso(lastDayOf(w), w.end) };
}

/** Short stable hash, so an event keeps the same id between calls. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Like Promise.all over items.map(fn), but at most `limit` calls run at once. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * The society's events that touch London days firstDay to lastDay (inclusive), with venues and
 * exact times from each event's page. Only the cards in range get their own page fetched, so a
 * one-day window stays quick. A trip that started before firstDay but is still on counts.
 * A missing /events page gives []. Throws if the first page can't be fetched (network, bot check).
 */
export async function societyEvents(society: Society, firstDay: DateKey, lastDay: DateKey): Promise<SocietyEvent[]> {
  const all = await allEventCards(society.slug);
  if (!all) return [];
  const cards = all.filter((c) => c.date <= lastDay && lastDayOf(c) >= firstDay);
  const details = await mapLimited(cards, DETAIL_CONCURRENCY, (c) => eventDetails(c.url));

  return cards.map((c, i): SocietyEvent => {
    const d = details[i];
    // The page's own date field beats the card: it has the exact end, even on a later day.
    const page = d.when;
    const when: When = page?.date
      ? page.end
        ? { date: page.date, start: page.start, end: page.end, endDate: page.endDate }
        : { date: page.date, start: page.start, end: c.end, endDate: c.endDate }
      : c;
    const buildingId = d.venue ? matchBuilding(d.venue) : undefined;
    return {
      id: `soc-${society.slug}-${when.date}-${when.start ? when.start.replace(":", "") : "TBC"}-${hash(c.title)}`,
      society: society.name,
      title: c.title,
      ...instants(when),
      venue: d.venue,
      ...(buildingId ? { buildingId } : {}),
      ...(c.url ? { url: c.url } : {}),
      tags: d.free ? ["free"] : [],
      ...(d.free ? { free: true } : {}),
      ...(d.membersOnly ? { membersOnly: true as const } : {}),
    };
  });
}
