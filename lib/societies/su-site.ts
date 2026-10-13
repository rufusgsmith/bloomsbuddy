// Fetching and reading UCL Students' Union society pages. Server-side only.
//
// Each society has two pages we care about:
//   /clubs-societies/<slug>         free-text description (where weekly sessions are written)
//   /clubs-societies/<slug>/events  event cards: title, "13/10/2026 | 19:00 - 21:15", blurb, link
// The cards don't show a venue; that's only on each event's own page, which we don't fetch.

import * as cheerio from "cheerio";
import type { Society } from "../types";

const BASE = "https://studentsunionucl.org/clubs-societies/";
const USER_AGENT = "Bloomsbuddy/0.1 (UCL student hackathon project; non-commercial)";
const TIMEOUT_MS = 8000;
/** Per page. Society pages are short; this just stops a giant page blowing up the prompt. */
const MAX_TEXT_CHARS = 12_000;

/** "UCL Chess Society" → "chess-society", "Baking & Pastry" → "baking-and-pastry". */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^ucl\b\s*/, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const isSlug = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

/** The page's HTML, or null if it doesn't exist. Throws on network errors and other bad statuses. */
async function fetchSuPage(path: string): Promise<string | null> {
  const res = await fetch(BASE + path, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SU page ${path} returned ${res.status}`);
  return res.text();
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
 */
export async function lookupSociety(typed: string): Promise<Society | null> {
  const slug = toSlug(typed);
  if (!isSlug(slug)) return null;
  const candidates = slug.endsWith("society") ? [slug] : [slug, `${slug}-society`];
  for (const candidate of candidates) {
    const html = await fetchSuPage(candidate);
    if (html) return { slug: candidate, name: pageName(html) || typed.trim() };
  }
  return null;
}

/** The main content area as plain text, minus scripts, styles and menus. */
function contentText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, nav, header, footer, form").remove();
  return clean($(".region-content").text() || $("main").text() || $("body").text()).slice(0, MAX_TEXT_CHARS);
}

/** One line per event card, so Claude can tie each date line and link to the right title. */
function eventCards($: cheerio.CheerioAPI): string {
  const lines = $(".region-content .card")
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
