// Finds the free gaps between a day's timetable events.
// All maths is on absolute instants (Date.parse respects the ISO offset), so the
// server's timezone never matters. See "Time rules" in CLAUDE.md.

import { BUILDINGS, nearestBuilding, travelTimeBetween, type BuildingId, type LatLng, type TravelMode } from "./buildings";
import type { Gap, IsoDateTime, TimetableEvent } from "./types";

/** Gaps with less usable time than this (after the trip to the next event) aren't worth recommending anything for. */
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

/** Where an event is, for gaps: a building id for the recommend tools, plus real coordinates for travel. */
interface EventSpot {
  buildingId: BuildingId;
  point: LatLng;
}

/**
 * Manual events can sit at a postcode or have no location. A postcode stands in as its nearest
 * UCL building (travel still uses its real coordinates). No location means the student is
 * probably still near the event before it (else the one after, else the Wilkins Building).
 */
function eventSpots(sorted: TimetableEvent[]): Map<string, EventSpot> {
  const own = sorted.map((e): EventSpot | null =>
    e.buildingId
      ? { buildingId: e.buildingId, point: BUILDINGS[e.buildingId] }
      : e.place
        ? { buildingId: nearestBuilding(e.place), point: e.place }
        : null,
  );
  const fallback: BuildingId = "main-building";
  const spots = new Map<string, EventSpot>();
  sorted.forEach((e, i) => {
    const found =
      own[i] ??
      own.slice(0, i).reverse().find((x) => x !== null) ??
      own.slice(i + 1).find((x) => x !== null) ?? { buildingId: fallback, point: BUILDINGS[fallback] };
    spots.set(e.id, found);
  });
  return spots;
}

function tripBetween(a: EventSpot, b: EventSpot): { mins: number; mode: TravelMode } {
  if (a.point.lat === b.point.lat && a.point.lng === b.point.lng) return { mins: 0, mode: "walk" };
  return travelTimeBetween(a.point, b.point);
}

/**
 * Returns every gap between consecutive events with MIN_GAP_MINS or more usable time after travel.
 * Pass one day's events (timetable and manual). They can be in any order and may overlap: time
 * covered by any event is never part of a gap, so an event inside free time splits it in two,
 * and each leftover piece is kept only if it's still long enough on its own.
 */
export function findGaps(
  events: TimetableEvent[],
  opts: { locationOverride?: BuildingId } = {},
): Gap[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const spots = eventSpots(sorted);
  const gaps: Gap[] = [];

  // Track the event that finishes latest so far, so overlapping events don't create fake gaps.
  let latest: TimetableEvent | undefined;

  for (const next of sorted) {
    if (latest) {
      const durationMins = (Date.parse(next.start) - Date.parse(latest.end)) / MS_PER_MIN;

      const prevSpot = spots.get(latest.id)!;
      const nextSpot = spots.get(next.id)!;
      const here: EventSpot = opts.locationOverride
        ? { buildingId: opts.locationOverride, point: BUILDINGS[opts.locationOverride] }
        : prevSpot;
      // Only worth working out the trip when the gap could be long enough.
      const travel = durationMins >= MIN_GAP_MINS ? tripBetween(here, nextSpot) : null;

      if (travel && durationMins - travel.mins >= MIN_GAP_MINS) {
        gaps.push({
          id: `gap-${latest.id}-${next.id}`,
          start: latest.end,
          end: next.start,
          durationMins,
          usableMins: durationMins - travel.mins,
          travelMins: travel.mins,
          travelMode: travel.mode,
          prevEvent: latest,
          nextEvent: next,
          prevLocationId: prevSpot.buildingId,
          nextLocationId: nextSpot.buildingId,
          locationId: here.buildingId,
          locationSource: opts.locationOverride ? "manual" : "inferred",
        });
      }
    }

    if (!latest || Date.parse(next.end) > Date.parse(latest.end)) latest = next;
  }

  return gaps;
}
