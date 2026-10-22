// Moves the mock data to the current week, so demo mode never runs out of days.
// The mock files are written as the week of Mon 12 Oct 2026 (easy to read and edit). Each call
// shifts them by whole weeks to the demo week below. Recomputed on every call, so a long-running
// server or an open tab doesn't get stuck on an old week.

import { addDays, dayOfWeek, londonIso, londonTodayKey, mondayOf } from "../london-time";
import type { DateKey, IsoDateTime } from "../types";

/** The Monday the mock files are written against. */
const BASE_MONDAY = "2026-10-12";

/** This week's Monday in London. At the weekend, next week's: a finished week isn't much use. */
export function demoMonday(today: DateKey = londonTodayKey()): DateKey {
  const monday = mondayOf(today);
  return dayOfWeek(today) > 5 ? addDays(monday, 7) : monday;
}

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
