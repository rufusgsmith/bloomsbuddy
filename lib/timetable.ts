// Expands the student's weekly pattern into concrete events for every week of term.

import { addDays, londonIso } from "./london-time";
import type { DateKey, TimetableEvent, WeeklyClass } from "./types";

export function expandWeekly(classes: WeeklyClass[], termStart: DateKey, weeks: number): TimetableEvent[] {
  const events: TimetableEvent[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const c of classes) {
      const day = addDays(termStart, 7 * w + c.dayOfWeek - 1);
      events.push({
        // Unique per week, so gap ids (built from event ids) are unique across the term too.
        id: `${c.id}-w${w + 1}`,
        moduleCode: c.moduleCode,
        title: c.title,
        kind: c.kind,
        start: londonIso(day, c.startTime),
        end: londonIso(day, c.endTime),
        buildingId: c.buildingId,
        room: c.room,
      });
    }
  }
  return events;
}
