// Clashes: events that overlap one being added. Pure, so the event form and the Societies tab share it.
// Maths is on absolute instants (Date.parse respects the ISO offset), like gaps.ts.

import { formatTimeRange } from "./london-time";
import type { IsoDateTime, TimetableEvent } from "./types";

/** The day's events that overlap start–end. Touching (one ends as the other starts) isn't a clash. */
export function findClashes(
  dayEvents: TimetableEvent[],
  start: IsoDateTime,
  end: IsoDateTime,
  skip: (e: TimetableEvent) => boolean = () => false,
): TimetableEvent[] {
  const s = Date.parse(start);
  const en = Date.parse(end);
  return dayEvents
    .filter((e) => !skip(e) && Date.parse(e.start) < en && Date.parse(e.end) > s)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** "Clashes with ECON0013 Microeconomics 10:00–11:00", several joined with commas. */
export function clashMessage(clashes: TimetableEvent[]): string {
  const labels = clashes.map(
    (e) => `${[e.moduleCode, e.title].filter(Boolean).join(" ")} ${formatTimeRange(e.start, e.end)}`,
  );
  return `Clashes with ${labels.join(", ")}`;
}
