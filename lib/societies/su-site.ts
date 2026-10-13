// Fetching and reading UCL Students' Union society pages. Server-side only.
//
// Each society has two pages we care about:
//   /clubs-societies/<slug>         free-text description (where weekly sessions are written)
//   /clubs-societies/<slug>/events  event cards: title, "13/10/2026 | 19:00 - 21:15", blurb, link
// The cards don't show a venue; that's only on each event's own page, which we don't fetch.

import * as cheerio from "cheerio";
import { BlockedError, isBotChallenge } from "../bot-check";
import type { Society } from "../types";
import { isSlug, toSlug } from "./slug";

export { isSlug, toSlug };

const BASE = "https://studentsunionucl.org/clubs-societies/";
const USER_AGENT = "Bloomsbuddy/0.1 (UCL student hackathon project; non-commercial)";
const TIMEOUT_MS = 8000;
/** Per page. Society pages are short; this just keeps the prompt small. */
const MAX_TEXT_CHARS = 6_000;
/**
 * The page body, most specific first. `.region-content` is the society's own text.
 * `#main-content` wraps it plus the sidebar (membership price, contacts, SU disclaimer), whose
 * "£18.00" could make Claude tag events as paid, so it's only a fallback if the theme changes.
 */
const CONTENT = [".region-content", "#main-content", "main", "body"];

/**
 * The page's HTML, or null if it doesn't exist. Throws BlockedError on a bot check,
 * and a plain Error on network errors and other bad statuses.
 */
async function fetchSuPage(path: string): Promise<string | null> {
  const res = await fetch(BASE + path, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  const html = await res.text();
  if (isBotChallenge(res.status, html)) throw new BlockedError(BASE + path);
  if (!res.ok) throw new Error(`SU page ${path} returned ${res.status}`);
  return html;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "Chess Society | Students Union UCL" → "Chess Society". */
function pageName(html: string): string {
  const $ = cheerio.load(html);
  return clean($("title").text().split("|")[0] ?? "");
}

/**
 * Finds the society a student typed. Tries the name as a slug, then with "-society" added
 * (students often type "Chess" for "Chess Society"). Null if neither page exists.
 * With `exactSlug`, checks just that slug: used when the student fixes the slug by hand.
 */
export async function lookupSociety(typed: string, exactSlug = false): Promise<Society | null> {
  const slug = exactSlug ? typed.trim() : toSlug(typed);
  if (!isSlug(slug)) return null;
  const candidates = exactSlug || slug.endsWith("society") ? [slug] : [slug, `${slug}-society`];
  for (const candidate of candidates) {
    const html = await fetchSuPage(candidate);
    if (html) return { slug: candidate, name: pageName(html) || (exactSlug ? candidate : typed.trim()) };
  }
  return null;
}

/** The main content area as plain text, minus scripts, styles and menus. */
function contentText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, nav, header, footer, form").remove();
  for (const sel of CONTENT) {
    const text = clean($(sel).first().text());
    if (text) return text.slice(0, MAX_TEXT_CHARS);
  }
  return "";
}

/** One line per event card, so Claude can tie each date line and link to the right title. */
function eventCards($: cheerio.CheerioAPI): string {
  const lines = $(".region-content .card, #main-content .card")
    .map((_, el) => {
      const card = $(el);
      const title = clean(card.find(".card_title_field").text());
      const when = clean(card.find(".card_subheading_1").text());
      const url = card.find("a.card-link").attr("href") ?? "";
      const blurb = clean(card.find(".content-fields").text().replace(title, "").replace(when, ""));
      return title ? `- ${title} | ${when} | ${blurb} | ${url}` : null;
    })
    .get()
    .filter(Boolean);
  return lines.join("\n").slice(0, MAX_TEXT_CHARS);
}

/** Text of both pages, ready to drop into a prompt. Throws if the society page itself is gone. */
export async function societyPageText(slug: string): Promise<{ about: string; events: string }> {
  const [mainHtml, eventsHtml] = await Promise.all([fetchSuPage(slug), fetchSuPage(`${slug}/events`)]);
  if (!mainHtml) throw new Error(`No SU page for society "${slug}"`);

  const about = contentText(cheerio.load(mainHtml));
  let events = "No events page.";
  if (eventsHtml) {
    const $ = cheerio.load(eventsHtml);
    // Cards first. If the layout ever changes and no cards match, fall back to the raw text.
    events = eventCards($) || contentText($) || "No events listed.";
  }
  return { about, events };
}
