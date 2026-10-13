// Finds the free gaps between a day's timetable events.
// All maths is on absolute instants (Date.parse respects the ISO offset), so the
// server's timezone never matters. See "Time rules" in CLAUDE.md.

import { travelTime, type BuildingId } from "./buildings";
import type { Gap, IsoDateTime, TimetableEvent } from "./types";

/** Gaps shorter than this aren't worth recommending anything for. */
export const MIN_GAP_MINS = 30;

const MS_PER_MIN = 60_000;

// "en-CA" formats dates as YYYY-MM-DD, which makes a handy sortable day key.
const londonDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Europe/London calendar day of an instant, e.g. "2026-10-16". */
export function londonDateKey(iso: IsoDateTime): string {
  return londonDay.format(new Date(iso));
}

/** Events that start on the given London calendar day ("YYYY-MM-DD"). */
export function eventsOnDay(events: TimetableEvent[], dateKey: string): TimetableEvent[] {
  return events.filter((e) => londonDateKey(e.start) === dateKey);
}

/**
 * Returns every gap of MIN_GAP_MINS or more between consecutive events.
 * Pass one day's events. They can be in any order and may overlap.
 */
export function findGaps(
  events: TimetableEvent[],
  opts: { locationOverride?: BuildingId } = {},
): Gap[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const gaps: Gap[] = [];

  // Track the event that finishes latest so far, so overlapping events don't create fake gaps.
  let latest: TimetableEvent | undefined;

  for (const next of sorted) {
    if (latest) {
      const durationMins = (Date.parse(next.start) - Date.parse(latest.end)) / MS_PER_MIN;

      if (durationMins >= MIN_GAP_MINS) {
        const locationId = opts.locationOverride ?? latest.buildingId;
        const travel = travelTime(locationId, next.buildingId);
        gaps.push({
          id: `gap-${latest.id}-${next.id}`,
          start: latest.end,
          end: next.start,
          durationMins,
          usableMins: Math.max(0, durationMins - travel.mins),
          travelMins: travel.mins,
          travelMode: travel.mode,
          prevEvent: latest,
          nextEvent: next,
          prevLocationId: latest.buildingId,
          nextLocationId: next.buildingId,
          locationId,
          locationSource: opts.locationOverride ? "manual" : "inferred",
        });
      }
    }

    if (!latest || Date.parse(next.end) > Date.parse(latest.end)) latest = next;
  }

  return gaps;
}
