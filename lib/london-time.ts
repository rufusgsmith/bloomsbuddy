// Turning London calendar days + wall-clock times into ISO instants, and back.
// Pure (no machine-timezone reliance), so it works the same on Vercel (UTC) and in the browser.
// See "Time rules" in CLAUDE.md.

import type { DateKey, IsoDateTime, WallTime } from "./types";

const MS_PER_DAY = 86_400_000;

const londonParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "YYYY-MM-DD HH:MM" for an instant, in London. */
function londonStamp(ms: number): string {
  const p = Object.fromEntries(londonParts.formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export const isDateKey = (s: unknown): s is DateKey =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

export const isWallTime = (s: unknown): s is WallTime =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * London wall-clock time on a London day → ISO string with the right offset,
 * e.g. ("2026-10-26", "10:00") → "2026-10-26T10:00:00+00:00" (BST ended on 25 Oct).
 * London is only ever +01:00 or +00:00, so try both and keep the one that round-trips.
 */
export function londonIso(dateKey: DateKey, time: WallTime): IsoDateTime {
  for (const offset of ["+01:00", "+00:00"]) {
    const iso = `${dateKey}T${time}:00${offset}`;
    if (londonStamp(Date.parse(iso)) === `${dateKey} ${time}`) return iso;
  }
  // Only happens for times that don't exist (the skipped hour when clocks go forward). Close enough.
  return `${dateKey}T${time}:00+00:00`;
}

/** Calendar maths on day keys. Done at midday UTC, which is always the same London day. */
export function addDays(dateKey: DateKey, n: number): DateKey {
  return new Date(Date.parse(`${dateKey}T12:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function dayOfWeek(dateKey: DateKey): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay() || 7;
}

/** The Monday on or before this day. */
export function mondayOf(dateKey: DateKey): DateKey {
  return addDays(dateKey, 1 - dayOfWeek(dateKey));
}

/** Today's London calendar day. */
export function londonTodayKey(): DateKey {
  return londonStamp(Date.now()).slice(0, 10);
}

/** London weekday (1 = Monday … 7 = Sunday) and minutes since midnight for an instant. */
export function londonWeekdayAndMinutes(iso: IsoDateTime): { weekday: number; minutes: number } {
  const stamp = londonStamp(Date.parse(iso));
  return {
    weekday: dayOfWeek(stamp.slice(0, 10)),
    minutes: Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)),
  };
}
