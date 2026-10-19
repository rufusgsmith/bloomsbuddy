// Reading a calendar file (.ics) from Google, Outlook, Apple or the UCL timetable into manual events.
// Pure and done in the browser: no Claude, no server. See RFC 5545 for the format.
//
// Repeating events are expanded into one-off occurrences between two days (this week to the end
// of term): ManualEvent.weekly has no end date, and real calendars have UNTIL, COUNT, skipped
// weeks (EXDATE) and one-week changes (RECURRENCE-ID).

import { matchBuilding } from "./buildings";
import { findClashes } from "./clashes";
import { londonDateKey } from "./gaps";
import { addDays, dayOfWeek, londonIso, londonWeekdayAndMinutes, mondayOf } from "./london-time";
import { icsEventId, isImported, isManualEvent, MAX_TITLE, wallTimeOf, whenFields } from "./manual-events";
import type { DateKey, EventKind, ManualEvent, TimetableEvent, WallTime } from "./types";

/** Most occurrences one import adds. A whole term of a busy calendar is well under this. */
const MAX_OCCURRENCES = 1000;
/** Rule steps tried per event, so a broken rule can't loop forever. */
const MAX_STEPS = 5000;

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** A DTSTART-style value: a day, plus a wall time and its zone unless it's a whole-day value. */
interface IcsTime {
  date: DateKey;
  time?: WallTime;
  /** IANA zone the wall time is in. Missing = London (floating times are read as London). */
  zone?: string;
}

interface VEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: IcsTime;
  /** Exclusive end. Missing when the file gives none (DURATION or nothing). */
  end?: IcsTime;
  durationMs?: number;
  rrule?: Record<string, string>;
  /** Start instants (ms) or days (all-day) not to use. */
  exdates: Set<string>;
  recurrenceId?: IcsTime;
  cancelled: boolean;
}

/** One concrete event, after repeats are expanded. */
interface Occurrence {
  uid: string;
  summary: string;
  location: string;
  description: string;
  /** ISO instants for a timed event. */
  start?: string;
  end?: string;
  /** First and last day of a whole-day event. */
  allDay?: { first: DateKey; last: DateKey };
}

// ---------- Lines ----------

function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

const unescape = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

function parseLine(line: string): Prop | null {
  // The name and params end at the first ":" outside double quotes.
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

// ---------- Time zones ----------

/** Outlook writes Windows zone names. The common ones; anything else unknown is read as London. */
const WINDOWS_ZONES: Record<string, string> = {
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Bucharest",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Pacific Standard Time": "America/Los_Angeles",
  "China Standard Time": "Asia/Shanghai",
  "India Standard Time": "Asia/Kolkata",
  "Tokyo Standard Time": "Asia/Tokyo",
  UTC: "UTC",
};

const zoneFormats = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormat(zone: string): Intl.DateTimeFormat | null {
  if (!zoneFormats.has(zone)) {
    try {
      zoneFormats.set(
        zone,
        new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
      );
    } catch {
      zoneFormats.set(zone, null);
    }
  }
  return zoneFormats.get(zone) ?? null;
}

/** An IANA zone for a TZID, or undefined for London (also for names we don't know). */
function zoneFor(tzid: string | undefined): string | undefined {
  if (!tzid) return undefined;
  const name = WINDOWS_ZONES[tzid] ?? tzid.replace(/^\//, "");
  return name === "Europe/London" || !zoneFormat(name) ? undefined : name;
}

/** How far ahead of UTC a zone's clock is at an instant, in ms. */
function zoneOffsetMs(ms: number, zone: string): number {
  const p = Object.fromEntries(zoneFormat(zone)!.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000;
}

/** A timed IcsTime as an ISO instant with London's offset. */
function toLondonIso(t: IcsTime): string {
  const time = t.time ?? "00:00";
  if (!t.zone) return londonIso(t.date, time);
  // Guess the instant as if the wall time were UTC, then correct by the zone's offset (twice, for DST edges).
  const guess = Date.parse(`${t.date}T${time}:00Z`);
  let ms = guess - zoneOffsetMs(guess, t.zone);
  ms = guess - zoneOffsetMs(ms, t.zone);
  const iso = new Date(ms).toISOString();
  return londonIso(londonDateKey(iso), wallTimeOf(londonWeekdayAndMinutes(iso).minutes));
}

/** "20261016", "20261016T100000", "20261016T100000Z" with its TZID / VALUE params. */
function parseTime(value: string, params: Record<string, string>): IcsTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || params.VALUE === "DATE") return { date };
  return { date, time: `${m[4]}:${m[5]}`, zone: m[6] ? "UTC" : zoneFor(params.TZID) };
}

/** "PT1H30M", "P1D", "P1W" in ms. */
function parseDuration(v: string): number | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return undefined;
  const [, sign, w, d, h, min, s] = m.map((x) => x ?? "0");
  const ms = ((((Number(w) * 7 + Number(d)) * 24 + Number(h)) * 60 + Number(min)) * 60 + Number(s)) * 1000;
  return sign === "-" ? -ms : ms;
}

/** How an occurrence's start is matched against EXDATE and RECURRENCE-ID: its instant, or its day. */
const startKey = (t: IcsTime) => (t.time ? String(Date.parse(toLondonIso(t))) : t.date);

// ---------- Events ----------

function readEvents(text: string): VEvent[] {
  const events: VEvent[] = [];
  let props: Prop[] | null = null;
  let depth = 0; // VALARMs nest inside a VEVENT
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
      props = [];
      depth = 0;
    } else if (props && p.name === "BEGIN") depth++;
    else if (props && p.name === "END" && depth > 0) depth--;
    else if (props && p.name === "END" && p.value.toUpperCase() === "VEVENT") {
      const e = toVEvent(props);
      if (e) events.push(e);
      props = null;
    } else if (props && depth === 0) props.push(p);
  }
  return events;
}

function toVEvent(props: Prop[]): VEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const dtstart = get("DTSTART");
  const start = dtstart && parseTime(dtstart.value, dtstart.params);
  if (!start) return null;
  const dtend = get("DTEND");
  const rrule = get("RRULE");
  const rid = get("RECURRENCE-ID");
  const exdates = new Set<string>();
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const v of p.value.split(",")) {
      const t = parseTime(v, p.params);
      if (t) exdates.add(startKey(t));
    }
  }
  return {
    uid: get("UID")?.value.trim() || `${start.date}-${get("SUMMARY")?.value ?? ""}`,
    summary: unescape(get("SUMMARY")?.value ?? "").trim(),
    location: unescape(get("LOCATION")?.value ?? "").trim(),
    description: unescape(get("DESCRIPTION")?.value ?? ""),
    start,
    end: dtend ? (parseTime(dtend.value, dtend.params) ?? undefined) : undefined,
    durationMs: get("DURATION") ? parseDuration(get("DURATION")!.value) : undefined,
    rrule: rrule
      ? Object.fromEntries(
          rrule.value.split(";").map((kv) => {
            const [k, v = ""] = kv.split("=");
            return [k.toUpperCase(), v];
          }),
        )
      : undefined,
    exdates,
    recurrenceId: rid ? (parseTime(rid.value, rid.params) ?? undefined) : undefined,
    cancelled: get("STATUS")?.value.trim().toUpperCase() === "CANCELLED",
  };
}

const WEEKDAYS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

/** Days in a month, for "YYYY-MM". */
const monthLength = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * The start days of a repeating event, from its first one up to `last`. Supports DAILY, WEEKLY (with
 * BYDAY) and MONTHLY / YEARLY on the start's day of the month. Any other rule keeps only the first.
 */
function repeatDays(e: VEvent, last: DateKey): DateKey[] {
  const r = e.rrule;
  const first = e.start.date;
  if (!r) return [first];
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? parseTime(r.UNTIL, {}) : null;
  // UNTIL in UTC can fall on the next London day only after midnight, so the day is close enough.
  const untilDay = until ? (until.time ? londonDateKey(toLondonIso(until)) : until.date) : null;
  const end = untilDay && untilDay < last ? untilDay : last;
  const days: DateKey[] = [];
  const push = (d: DateKey) => {
    if (d >= first && d <= end && days.length < count) days.push(d);
  };

  if (r.FREQ === "DAILY") {
    for (let i = 0, d = first; i < MAX_STEPS && d <= end && days.length < count; i++, d = addDays(first, i * interval)) push(d);
  } else if (r.FREQ === "WEEKLY") {
    const byDay = (r.BYDAY ?? "")
      .split(",")
      .map((x) => WEEKDAYS[x.trim().slice(-2).toUpperCase()])
      .filter(Boolean)
      .sort();
    const weekdays = byDay.length ? byDay : [dayOfWeek(first)];
    const monday = mondayOf(first);
    for (let w = 0; w < MAX_STEPS && addDays(monday, w * 7 * interval) <= end && days.length < count; w++) {
      for (const wd of weekdays) push(addDays(monday, w * 7 * interval + wd - 1));
    }
  } else if ((r.FREQ === "MONTHLY" || r.FREQ === "YEARLY") && !r.BYDAY && !r.BYSETPOS) {
    const step = r.FREQ === "YEARLY" ? 12 * interval : interval;
    const [y, m, d] = first.split("-").map(Number);
    for (let i = 0; i < MAX_STEPS && days.length < count; i++) {
      const total = m - 1 + i * step;
      const year = y + Math.floor(total / 12);
      const month = (total % 12) + 1;
      const key = `${year}-${String(month).padStart(2, "0")}-01`;
      if (key > end) break;
      // A month without that day (31 Apr) is skipped, as RFC 5545 says.
      if (d <= monthLength(year, month)) push(`${key.slice(0, 8)}${String(d).padStart(2, "0")}`);
    }
  } else {
    push(first);
  }
  return days;
}

/** One occurrence starting on `day` (same wall time and zone as the first), unless it's skipped. */
function occurrenceOn(e: VEvent, day: DateKey): Occurrence | null {
  const start: IcsTime = { ...e.start, date: day };
  if (e.exdates.has(startKey(start))) return null;
  const base = { uid: e.uid, summary: e.summary, location: e.location, description: e.description };
  // Each occurrence lasts as long as the first one did.
  if (!start.time) {
    const lengthDays = e.end && !e.end.time
      ? Math.max(1, Math.round((Date.parse(e.end.date) - Date.parse(e.start.date)) / 86_400_000))
      : Math.max(1, Math.round((e.durationMs ?? 86_400_000) / 86_400_000));
    return { ...base, allDay: { first: day, last: addDays(day, lengthDays - 1) } };
  }
  const firstStart = Date.parse(toLondonIso(e.start));
  const lengthMs = e.end
    ? Date.parse(toLondonIso(e.end.time ? e.end : { ...e.end, time: "00:00", zone: e.start.zone })) - firstStart
    : (e.durationMs ?? 60 * 60_000);
  const startIso = toLondonIso(start);
  // A file with no length (or a broken one) gets an hour, like a society event with no end.
  const endMs = Date.parse(startIso) + (lengthMs > 0 ? lengthMs : 60 * 60_000);
  const endIso = new Date(endMs).toISOString();
  return { ...base, start: startIso, end: londonIso(londonDateKey(endIso), wallTimeOf(londonWeekdayAndMinutes(endIso).minutes)) };
}

/** The occurrence's first and last London day. */
function daysOf(o: Occurrence): { first: DateKey; last: DateKey } {
  return o.allDay ?? { first: londonDateKey(o.start!), last: londonDateKey(o.end!) };
}

/** Every occurrence touching from–to, cancelled ones and replaced weeks left out. */
function expand(events: VEvent[], from: DateKey, to: DateKey): Occurrence[] {
  // One-week changes, by series UID and the start they replace.
  const overrides = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.recurrenceId) continue;
    if (!overrides.has(e.uid)) overrides.set(e.uid, new Set());
    overrides.get(e.uid)!.add(startKey(e.recurrenceId));
  }
  const out: Occurrence[] = [];
  for (const e of events) {
    if (e.cancelled) continue;
    const replaced = e.recurrenceId ? undefined : overrides.get(e.uid);
    for (const day of e.recurrenceId ? [e.start.date] : repeatDays(e, to)) {
      if (replaced?.has(startKey({ ...e.start, date: day }))) continue;
      const o = occurrenceOn(e, day);
      if (!o) continue;
      const span = daysOf(o);
      if (span.last >= from && span.first <= to) out.push(o);
      if (out.length >= MAX_OCCURRENCES) return out;
    }
  }
  return out;
}

// ---------- Into manual events ----------

const MODULE_CODE = /\b[A-Z]{4}\d{4}\b/;

/** A class kind from the words in the title (or the description), else personal. */
function guessKind(summary: string, description: string): EventKind {
  for (const text of [summary, description]) {
    if (/\boffice hours?\b/i.test(text)) return "office-hours";
    if (/\blecture\b/i.test(text)) return "lecture";
    if (/\bseminar\b/i.test(text)) return "seminar";
    if (/\b(lab|laboratory|practical)\b/i.test(text)) return "lab";
    if (/\btutorial\b/i.test(text)) return "tutorial";
  }
  return "personal";
}

function toManual(o: Occurrence, id: string): ManualEvent {
  const moduleCode = MODULE_CODE.exec(o.summary)?.[0];
  // "ECON0013 - Lecture" shows as "ECON0013 Lecture", not "ECON0013 ECON0013 - Lecture".
  const bare = moduleCode ? o.summary.replace(moduleCode, "").replace(/^[\s\-–:|/]+|[\s\-–:|/]+$/g, "") : o.summary;
  const title = (bare || o.summary || "Untitled event").slice(0, MAX_TITLE);
  const buildingId = o.location ? matchBuilding(o.location) : undefined;
  const when = o.allDay
    ? {
        date: o.allDay.first,
        startTime: "00:00",
        endTime: "23:59",
        allDay: true as const,
        ...(o.allDay.last > o.allDay.first ? { endDate: o.allDay.last } : {}),
      }
    : whenFields(o.start!, o.end!);
  return {
    id,
    title,
    ...(moduleCode ? { moduleCode } : {}),
    kind: guessKind(o.summary, o.description),
    ...when,
    ...(o.location ? { room: o.location.slice(0, MAX_TITLE) } : {}),
    ...(buildingId ? { location: { kind: "building" as const, buildingId } } : {}),
    weekly: false,
  };
}

export interface ImportPlan {
  /** Events in the file between from and to, before duplicates are taken out. */
  found: number;
  /** Ready to save. */
  add: ManualEvent[];
  /** Already on the timetable or added by hand, so left out. */
  duplicates: number;
  /** Of `add`, how many overlap something already on Today. */
  clashes: number;
  /** Every UID in the file: re-importing replaces what an earlier import of these saved. */
  uids: string[];
}

const MIN = 60_000;
const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 10 * MIN;
/** From the timetable (or a one-day edit of a class), not something the student added. */
const isClass = (e: TimetableEvent) => (!e.manualId || e.fromClass) && !e.todoId && !e.deadlineId;

/** Same class as one already on the timetable: they overlap, and share a module code or (nearly) the same times. */
function isDuplicate(m: ManualEvent, dayEvents: TimetableEvent[], existing: ManualEvent[]): boolean {
  const sameHandAdded = existing.some(
    (x) => !isImported(x) && x.date === m.date && x.startTime === m.startTime && x.title.toLowerCase() === m.title.toLowerCase(),
  );
  if (sameHandAdded || m.allDay) return sameHandAdded;
  const start = londonIso(m.date, m.startTime);
  const end = londonIso(m.date, m.endTime);
  return findClashes(dayEvents.filter(isClass), start, end).some(
    (c) => (!!m.moduleCode && c.moduleCode === m.moduleCode) || (near(c.start, start) && near(c.end, end)),
  );
}

/**
 * What importing this file would do, from `from` to `to`. `eventsOn` gives a day's events as Today
 * shows them, for the duplicate and clash checks. Throws if the text isn't a calendar.
 */
export function planImport(
  text: string,
  from: DateKey,
  to: DateKey,
  eventsOn: (dateKey: DateKey) => TimetableEvent[],
  existing: ManualEvent[],
): ImportPlan {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not a calendar");
  const events = readEvents(text);
  const occurrences = expand(events, from, to);
  const ids = new Set<string>();
  const add: ManualEvent[] = [];
  let duplicates = 0;
  let clashes = 0;
  for (const o of occurrences) {
    const base = icsEventId(o.uid, daysOf(o).first);
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}#${n}`;
    ids.add(id);
    const m = toManual(o, id);
    if (!isManualEvent(m)) continue;
    const dayEvents = eventsOn(m.date);
    if (isDuplicate(m, dayEvents, existing)) {
      duplicates++;
      continue;
    }
    // Events from an earlier import of this file are about to be replaced, so they don't count.
    const replaced = (e: TimetableEvent) => !!e.manualId && isImported({ id: e.manualId });
    if (!m.allDay && findClashes(dayEvents, londonIso(m.date, m.startTime), londonIso(m.date, m.endTime), replaced).length) {
      clashes++;
    }
    add.push(m);
  }
  return { found: occurrences.length, add, duplicates, clashes, uids: [...new Set(events.map((e) => e.uid))] };
}
