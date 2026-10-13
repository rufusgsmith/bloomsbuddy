// Fetching and reading UCL Students' Union society pages. Server-side only. No Claude:
// the pages are structured enough to read directly, so this costs no API tokens.
//
// Pages we read:
//   /clubs-societies/<slug>          only its <title>, for the society's name
//   /clubs-societies/<slug>/events   event cards: title, "13/10/2026 | 19:00 - 21:15", link
//   each event's own page            venue and tags ("Free", "Alcohol Free", …)
//
// Only dated events on the /events page are found. Weekly sessions written only in the
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
/** Matches the recommender's horizon: today plus the next 13 days. */
const HORIZON_DAYS = 14;
/** SocietyEvent needs an end. When the card gives none, assume an hour (flagged endEstimated). */
const DEFAULT_LENGTH_MINS = 60;

/**
 * The page's HTML, or null if it doesn't exist. Throws BlockedError on a bot check,
 * and a plain Error on network errors and other bad statuses.
 */
async function fetchSuPage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
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

interface Card {
  title: string;
  date: DateKey;
  start: WallTime;
  end?: WallTime;
  url?: string;
}

/** "9:00" → "09:00". */
const padTime = (t: string) => (/^\d:\d\d$/.test(t) ? `0${t}` : t);

/** "14/10/2026 | 13:30 - 15:00" → { date, start, end }. Null without a date and start time. */
function parseWhen(text: string): Pick<Card, "date" | "start" | "end"> | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?/);
  if (!m) return null;
  const date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const start = padTime(m[4]);
  const end = m[5] ? padTime(m[5]) : undefined;
  if (!isDateKey(date) || !isWallTime(start)) return null;
  return { date, start, ...(end && isWallTime(end) ? { end } : {}) };
}

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

interface Details {
  venue: string;
  free?: true;
  membersOnly?: true;
}

/** Venue and tags from an event's own page. Empty if the page can't be read: the card still counts. */
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
    return {
      venue,
      // "Free" on its own; "Alcohol Free" is a different tag.
      ...(tags.includes("free") ? { free: true as const } : {}),
      ...(/\bmembers?[- ]only\b/i.test(body) ? { membersOnly: true as const } : {}),
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

/** Short stable hash, so an event keeps the same id between calls. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * The society's dated events from today to today + 13 days, with venues from each event's page.
 * A missing /events page gives []. Throws if the page can't be fetched (network, bot check).
 */
export async function societyEvents(society: Society, today: DateKey): Promise<SocietyEvent[]> {
  const html = await fetchSuPage(`${BASE}${society.slug}/events`);
  if (!html) return [];
  const last = addDays(today, HORIZON_DAYS - 1);
  const cards = eventCards(html).filter((c) => c.date >= today && c.date <= last);
  const details = await Promise.all(cards.map((c) => eventDetails(c.url)));

  return cards.map((c, i): SocietyEvent => {
    const d = details[i];
    // Past midnight ("19:00 - 01:00") is cut at 23:59: we only care about daytime gaps anyway.
    const end = c.end ? (c.end > c.start ? c.end : "23:59") : plusMins(c.start, DEFAULT_LENGTH_MINS);
    const buildingId = d.venue ? matchBuilding(d.venue) : undefined;
    return {
      id: `soc-${society.slug}-${c.date}-${c.start.replace(":", "")}-${hash(c.title)}`,
      society: society.name,
      title: c.title,
      start: londonIso(c.date, c.start),
      end: londonIso(c.date, end),
      venue: d.venue,
      ...(buildingId ? { buildingId } : {}),
      ...(c.url ? { url: c.url } : {}),
      tags: d.free ? ["free"] : [],
      ...(d.free ? { free: true } : {}),
      ...(d.membersOnly ? { membersOnly: true as const } : {}),
      ...(c.end ? {} : { endEstimated: true as const }),
    };
  });
}
