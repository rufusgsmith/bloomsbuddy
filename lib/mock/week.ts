// The demo week is always Mon 19 – Sun 25 Oct 2026, whatever the real date, so its deadlines and
// to-dos never go overdue. The mock files are written as the week of Mon 12 Oct 2026 and moved here
// by toDemoWeek. "Now" in the demo is the real London weekday and time placed in that week
// (demoNow), so a visitor on a Thursday at 14:05 sees Thursday 22 Oct at 14:05.

import { addDays, londonIso, londonWeekdayAndMinutes } from "../london-time";
import type { DateKey, IsoDateTime } from "../types";

/** The Monday the mock files are written against. */
const BASE_MONDAY = "2026-10-12";

/** The demo week's Monday. Fixed: the ready-made picks and their weekday wording are written for it. */
export const DEMO_MONDAY: DateKey = "2026-10-19";

export const demoMonday = (): DateKey => DEMO_MONDAY;

const pad = (n: number) => String(n).padStart(2, "0");

/** The real London weekday and time of `real` (ms), moved into the demo week, in ms. */
export function demoNow(real: number = Date.now()): number {
  const { weekday, minutes } = londonWeekdayAndMinutes(new Date(real).toISOString());
  const at = londonIso(addDays(DEMO_MONDAY, weekday - 1), `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  return Date.parse(at) + (real % 60_000);
}

/** The demo week's "today": the day with the real weekday. */
export const demoTodayKey = (real: number = Date.now()): DateKey =>
  addDays(DEMO_MONDAY, londonWeekdayAndMinutes(new Date(real).toISOString()).weekday - 1);

/**
 * A mock instant moved into the demo week. Mock instants are written in London's own offset,
 * so the string's date and time are the London wall clock. londonIso then picks the right
 * offset for the new date, so the end of BST (25 Oct) is handled whichever week it falls in.
 */
export function toDemoWeek(iso: IsoDateTime, monday: DateKey = demoMonday()): IsoDateTime {
  const shift = Math.round((Date.parse(monday) - Date.parse(BASE_MONDAY)) / 86_400_000);
  return londonIso(addDays(iso.slice(0, 10), shift), iso.slice(11, 16));
}

/** A mock London day ("2026-10-15") moved into the demo week. */
export const toDemoDay = (dateKey: DateKey, monday: DateKey = demoMonday()): DateKey =>
  toDemoWeek(`${dateKey}T12:00:00+01:00`, monday).slice(0, 10);
