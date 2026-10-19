// All-day items: society events with no time (timeTBC) or that run over several days (a trip).
// Once added, they sit as a strip at the top of each day they cover on Today. They aren't busy
// time and never split gaps, but Claude is told about them. Pure, so the server can use it too.

import { londonDateKey } from "./gaps";
import { addDays, londonWeekdayAndMinutes } from "./london-time";
import type { DateKey, ManualEvent, SocietyEvent } from "./types";

/** An end before this time on a later day is a late night out (a block cut at midnight), not a trip. */
const OVERNIGHT_END_MINS = 6 * 60;

/** Shown as an all-day strip rather than a time block: no time yet, or it runs into a later day past 06:00. */
export function isAllDaySociety(e: Pick<SocietyEvent, "start" | "end" | "timeTBC">): boolean {
  if (e.timeTBC) return true;
  const startDay = londonDateKey(e.start);
  const endDay = londonDateKey(e.end);
  if (endDay <= startDay) return false;
  return endDay > addDays(startDay, 1) || londonWeekdayAndMinutes(e.end).minutes > OVERNIGHT_END_MINS;
}

/** One day's strip. `label` is "Time TBC", "From 07:00", "All day" or "Until 18:00". */
export interface AllDayItem {
  id: string;
  manualId: string;
  title: string;
  label: string;
}

/** The last day an all-day manual event covers. */
export const lastDayOf = (m: ManualEvent): DateKey => m.endDate ?? m.date;

export function coversDay(m: ManualEvent, dateKey: DateKey): boolean {
  return m.allDay === true && m.date <= dateKey && dateKey <= lastDayOf(m);
}

/**
 * What the strip says on dateKey. A one-day society event has no real time: it's TBC. One from a
 * calendar file is a real whole-day event, and its 00:00 start and 23:59 end mean the whole day.
 */
export function allDayLabel(m: ManualEvent, dateKey: DateKey): string {
  if (!m.endDate) return m.societyEventId ? "Time TBC" : "All day";
  if (dateKey === m.date && m.startTime !== "00:00") return `From ${m.startTime}`;
  if (dateKey === m.endDate && m.endTime !== "23:59") return `Until ${m.endTime}`;
  return "All day";
}

/** The strips for one day, from the student's manual events. */
export function allDayOn(events: ManualEvent[], dateKey: DateKey): AllDayItem[] {
  return events
    .filter((m) => coversDay(m, dateKey))
    .map((m) => ({ id: `${m.id}@${dateKey}`, manualId: m.id, title: m.title, label: allDayLabel(m, dateKey) }));
}

/** "Seven Sisters hike (Time TBC)", for Claude. */
export const allDayText = (a: Pick<AllDayItem, "title" | "label">) => `${a.title} (${a.label})`;
