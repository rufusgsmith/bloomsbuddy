// The one-line note under the Today title. Plain and factual: no jokes, no emojis.
// Rule-based (no Claude), worked out from the day's own events on every render,
// so it changes as soon as the timetable does.

import { dayOfWeek, formatTime } from "./london-time";
import type { DateKey, TimetableEvent } from "./types";

export function dayNote(dateKey: DateKey, todayKey: DateKey, events: TimetableEvent[]): string {
  const today = dateKey === todayKey ? " today" : "";
  const sorted = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const n = sorted.length;

  if (n === 0) return dayOfWeek(dateKey) > 5 ? "Weekend, nothing scheduled" : `Nothing scheduled${today}`;
  if (n === 1) return `1 event${today}`;

  const first = sorted[0];
  const lastEnd = sorted.reduce((end, e) => (Date.parse(e.end) > Date.parse(end) ? e.end : end), first.end);
  // Back-to-back means every event starts the moment (or before) the previous one ends.
  const backToBack = sorted.every((e, i) => i === 0 || Date.parse(e.start) <= Date.parse(sorted[i - 1].end));
  if (backToBack) return `Back-to-back from ${formatTime(first.start)} to ${formatTime(lastEnd)}`;

  return `${n} events, first at ${formatTime(first.start)}`;
}
