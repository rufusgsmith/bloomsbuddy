// The one-liner under the Today title. Rule-based (no Claude), worked out from the day's own
// events on every render, so it changes as soon as the timetable does.

import { formatDuration } from "./duration";
import { dayOfWeek, formatTime } from "./london-time";
import type { DateKey, Gap, TimetableEvent } from "./types";

/** At or above either of these, a day counts as busy. */
const BUSY_EVENTS = 4;
const BUSY_CLASS_MINS = 5 * 60;

export function dayTagline(dateKey: DateKey, events: TimetableEvent[], gaps: Gap[]): string {
  const weekend = dayOfWeek(dateKey) > 5;
  const sorted = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  if (sorted.length === 0) {
    return weekend ? "Weekend, no lectures. Zero guilt 😌" : "Nothing timetabled. Whole day's yours 🌳";
  }

  const first = sorted[0];
  const lastEnd = sorted.reduce((end, e) => (Date.parse(e.end) > Date.parse(end) ? e.end : end), first.end);
  if (weekend) return `Weekend lecture? Rough. Done by ${formatTime(lastEnd)}.`;

  // Back-to-back means every class starts the moment (or before) the previous one ends.
  const backToBack =
    sorted.length >= 2 && sorted.every((e, i) => i === 0 || Date.parse(e.start) <= Date.parse(sorted[i - 1].end));
  if (backToBack) return `Back-to-back ${formatTime(first.start)}–${formatTime(lastEnd)}. Hydrate and survive 💪`;

  const n = sorted.length;
  const classes = `${n} ${n === 1 ? "class" : "classes"}`;
  const classMins = sorted.reduce((sum, e) => sum + (Date.parse(e.end) - Date.parse(e.start)) / 60_000, 0);
  const free = gaps.reduce((sum, g) => sum + g.usableMins, 0);
  if (n >= BUSY_EVENTS || classMins >= BUSY_CLASS_MINS) {
    return free > 0
      ? `Busy one: ${classes}, ${formatDuration(free)} free in between. Let's not waste it.`
      : `Busy one: ${classes}. Done by ${formatTime(lastEnd)}.`;
  }
  return free > 0
    ? `Light day: ${classes}, done by ${formatTime(lastEnd)}. ${formatDuration(free)} free in between.`
    : `Light day: ${classes}, done by ${formatTime(lastEnd)}.`;
}
