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

const londonWeekdayLong = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" });
const londonShortDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/**
 * How a day reads relative to today: "Today", "Tomorrow", "Yesterday", the weekday name
 * ("Thursday") up to 6 days ahead, otherwise "Mon 26 Oct".
 */
export function relativeDayLabel(dateKey: DateKey, todayKey: DateKey): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const diff = Math.round((date.getTime() - Date.parse(`${todayKey}T12:00:00Z`)) / MS_PER_DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff >= 2 && diff <= 6) return londonWeekdayLong.format(date);
  return londonShortDate.format(date);
}

/** "HH:MM" (24-hour) → 12-hour, e.g. "14:00" → "2pm", "14:30" → "2:30pm", "00:00" → "12am". */
export function formatWallTime(time: WallTime): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** An instant's London wall-clock time, 12-hour: "9am", "2:30pm". */
export function formatTime(iso: IsoDateTime): string {
  const { minutes } = londonWeekdayAndMinutes(iso);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return formatWallTime(`${hh}:${mm}`);
}

/** "9am–11am". */
export const formatTimeRange = (start: IsoDateTime, end: IsoDateTime) => `${formatTime(start)}–${formatTime(end)}`;
