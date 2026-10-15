// The data behind Claude's tools, shared by the gap picks (recommend.ts) and the chat (chat.ts).
// Each builder returns the text Claude sees for one tool call, measured against a ToolWindow:
// a gap, or any window the student asks about in chat.

import { BUILDINGS, FOOD_SPOTS, travelTime, travelTimeBetween, type BuildingId, type TravelMode } from "../buildings";
import { formatDuration } from "../duration";
import { londonDateKey } from "../gaps";
import { estimateBusyness } from "../library-busyness";
import { locationName, locationPoint } from "../location";
import { formatTime } from "../london-time";
import { byDueThenEstimate, repeatLabel } from "../todos";
import type { DeadlinesProvider, EventsProvider } from "../providers";
import type { BusynessLevel, EventLocation, Gap, HomeLocation, IsoDateTime, TimetableEvent, Todo } from "../types";

// Sonnet 5.5 prices in USD per million tokens, for the dev cost log. Thinking counts as output.
export const USD_PER_MTOK_IN = 2;
export const USD_PER_MTOK_OUT = 10;
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const LIBRARY_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].isLibrary);
/** Only suggest going home when the round trip still leaves this long there. */
const MIN_MINS_AT_HOME = 30;
/** How many lunch spots get_food_spots returns. */
const FOOD_SPOTS_SHOWN = 6;
const MS_PER_DAY = 86_400_000;

const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Fri 16 Oct, 14:30" in London time, so Claude never does timezone maths. */
export const fmt = (iso: IsoDateTime) => `${londonDay.format(new Date(iso))}, ${formatTime(iso)}`;
export const fmtTime = formatTime;
/** "Fri 16 Oct", for events whose time isn't known. */
export const fmtDay = (iso: IsoDateTime) => londonDay.format(new Date(iso));
/** "Thu 15 Oct" for a London day key. Midday UTC is always the same London day. */
export const fmtDateKey = (dateKey: string) => londonDay.format(new Date(`${dateKey}T12:00:00Z`));

export const isBuildingId = (x: unknown): x is BuildingId =>
  typeof x === "string" && (BUILDING_IDS as string[]).includes(x);

/** Libraries we have a busyness estimate for, at the given instant. */
export function studySpaces(at: IsoDateTime): { libraryId: BuildingId; busyness: BusynessLevel }[] {
  return LIBRARY_IDS.flatMap((libraryId) => {
    const estimate = estimateBusyness(libraryId, at);
    return estimate ? [{ libraryId, busyness: estimate.level }] : [];
  });
}

/** travelTime as tool-result fields, e.g. suffix "FromNear" gives { minsFromNear, modeFromNear }. */
function travelFields<S extends string>(suffix: S, from: BuildingId, to: BuildingId) {
  const { mins, mode } = travelTime(from, to);
  return { [`mins${suffix}`]: mins, [`mode${suffix}`]: mode } as Record<`mins${S}`, number> &
    Record<`mode${S}`, TravelMode>;
}

/** What the tools showed Claude, so we can check its answer against it. */
export interface Seen {
  /** Every society event shown, so we can enforce type "event". */
  eventIds: Set<string>;
  /** Busyness levels shown, so the UI's badges match the reason text. */
  libraries: Map<string, BusynessLevel>;
  /** Whether get_home said going home is worth it. Undefined = never asked. */
  homeWorthIt?: boolean;
  /** To-do ids shown, so a pick's todoId can only point at a real one. */
  todoIds: Set<string>;
}

export const newSeen = (): Seen => ({ eventIds: new Set(), libraries: new Map(), todoIds: new Set() });

/**
 * The stretch of time the tools measure against: where the student starts, what's next, how long.
 * A Gap is one. The chat builds one for any window the student asks about.
 */
export type ToolWindow = Pick<Gap, "start" | "end" | "durationMins" | "usableMins" | "locationId" | "nextLocationId">;


/**
 * The trip for a to-do or deadline tied to a place: there from where the student is, on to what's
 * next, and the minutes left at the place. Done here so Claude doesn't do the maths.
 */
function placeTrip(win: ToolWindow, loc: EventLocation | undefined) {
  if (!loc) return null;
  const there = travelTimeBetween(BUILDINGS[win.locationId], locationPoint(loc));
  const onward = travelTimeBetween(locationPoint(loc), BUILDINGS[win.nextLocationId]);
  return {
    place: locationName(loc),
    minsThere: there.mins,
    modeThere: there.mode,
    minsOnToNext: onward.mins,
    modeOnToNext: onward.mode,
    minsAtPlace: Math.max(0, win.durationMins - there.mins - onward.mins),
  };
}

export function studySpaceRows(win: ToolWindow, near: unknown, seen: Seen): string {
  const from = isBuildingId(near) ? near : win.locationId;
  const rows = studySpaces(win.start)
    .map(({ libraryId, busyness }) => {
      seen.libraries.set(libraryId, busyness);
      return {
        libraryId,
        name: BUILDINGS[libraryId].shortName,
        busyness,
        ...travelFields("FromNear", from, libraryId),
        ...travelFields("ToNextLecture", libraryId, win.nextLocationId),
      };
    })
    .sort((a, b) => a.minsFromNear - b.minsFromNear);
  return JSON.stringify(rows);
}

export async function eventRows(
  provider: EventsProvider,
  win: ToolWindow,
  start: string,
  end: string,
  addedEventIds: ReadonlySet<string>,
  seen: Seen,
): Promise<string> {
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return "Error: start and end must be ISO 8601 timestamps with an offset.";
  }
  const here = win.locationId;
  const next = win.nextLocationId;
  // Ones the student already added to their calendar are fixed plans, not suggestions.
  const events = (await provider.getEvents(start, end)).filter((e) => !addedEventIds.has(e.id));
  for (const e of events) seen.eventIds.add(e.id);
  const rows = events.map((e) => ({
    id: e.id,
    society: e.society,
    title: e.title,
    starts: e.timeTBC ? `${fmtDay(e.start)}, ${e.partOfDay ?? "time"} (time TBC)` : fmt(e.start),
    ends: e.endEstimated ? "not stated" : fmtTime(e.end),
    venue: e.venue || "not stated",
    ...(e.buildingId
      ? { ...travelFields("FromHere", here, e.buildingId), ...travelFields("ToNextLecture", e.buildingId, next) }
      : { minsFromHere: "unknown (venue isn't a mapped UCL building)", minsToNextLecture: "unknown" }),
    free: e.free ?? "not stated",
    ...(e.membersOnly ? { membersOnly: true } : {}),
    tags: e.tags,
  }));
  return rows.length ? JSON.stringify(rows) : "No society events in that window.";
}

/** dayGaps: the day's gaps, so Claude knows how much later time today falls before each deadline. */
export async function deadlineRows(
  provider: DeadlinesProvider,
  win: ToolWindow,
  withinDays: unknown,
  dayGaps: Gap[],
): Promise<string> {
  const days = Math.min(Math.max(Number(withinDays) || 7, 1), 60);
  const deadlines = await provider.getDeadlines(win.start, days);
  const gapStart = Date.parse(win.start);
  const laterGaps = dayGaps.filter((g) => Date.parse(g.start) > gapStart);
  const rows = deadlines.map((d) => {
    const due = Date.parse(d.due);
    // Do the overlap maths here so Claude doesn't have to (it got this wrong once).
    const laterGapsTodayBeforeDue = laterGaps
      .filter((g) => Date.parse(g.start) < due)
      .map((g) => ({
        when: `${fmtTime(g.start)}–${fmtTime(g.end)}`,
        usableMinsBeforeDue: Math.min(
          g.usableMins,
          Math.round((Math.min(due, Date.parse(g.end)) - Date.parse(g.start)) / 60_000),
        ),
      }));
    return {
      id: d.id,
      module: d.moduleCode,
      title: d.title,
      due: fmt(d.due),
      hoursUntilDueFromGapStart: Math.round((due - gapStart) / 3_600_000),
      weightPercent: d.weight ?? null,
      estimatedHours: d.estimatedHours ?? null,
      laterGapsTodayBeforeDue,
      totalLaterMinsBeforeDue: laterGapsTodayBeforeDue.reduce((sum, g) => sum + g.usableMinsBeforeDue, 0),
      location: placeTrip(win, d.location),
    };
  });
  return rows.length ? JSON.stringify(rows) : `No deadlines in the next ${days} days.`;
}

export function foodRows(win: ToolWindow, near: unknown): string {
  const from = BUILDINGS[isBuildingId(near) ? near : win.locationId];
  const rows = FOOD_SPOTS.map((f) => {
    const there = travelTimeBetween(from, f);
    const onward = travelTimeBetween(f, BUILDINGS[win.nextLocationId]);
    return {
      foodSpotId: f.id,
      name: f.name,
      kind: f.kind,
      price: f.price,
      note: f.note,
      minsFromNear: there.mins,
      modeFromNear: there.mode,
      minsToNextLecture: onward.mins,
      modeToNextLecture: onward.mode,
    };
  })
    .sort((a, b) => a.minsFromNear - b.minsFromNear)
    .slice(0, FOOD_SPOTS_SHOWN);
  return JSON.stringify(rows);
}

/** todos: already filtered to the window (todosForGap). */
export function todoRows(win: ToolWindow, todos: Todo[], seen: Seen): string {
  const gapDay = londonDateKey(win.start);
  const rows = [...todos].sort(byDueThenEstimate).map((t) => {
    seen.todoIds.add(t.id);
    const trip = placeTrip(win, t.location);
    const room = trip ? trip.minsAtPlace : win.usableMins;
    return {
      id: t.id,
      title: t.title,
      doBefore: t.doBefore ? fmtDateKey(t.doBefore) : null,
      daysUntilDoBefore: t.doBefore
        ? Math.round((Date.parse(`${t.doBefore}T12:00:00Z`) - Date.parse(`${gapDay}T12:00:00Z`)) / MS_PER_DAY)
        : null,
      repeats: t.repeat ? repeatLabel(t.repeat).replace(/^↻ /, "") : null,
      estMinutes: t.estMinutes ?? null,
      estimate: t.estMinutes ? formatDuration(t.estMinutes) : "not estimated",
      fitsInGap: t.estMinutes ? t.estMinutes <= room : "unknown",
      location: trip,
    };
  });
  return rows.length ? JSON.stringify(rows) : "No to-dos fit this window.";
}

export function homeRow(win: ToolWindow, home: HomeLocation, fromId: unknown, seen: Seen): string {
  const start = isBuildingId(fromId) ? fromId : win.locationId;
  const toHome = travelTimeBetween(BUILDINGS[start], home);
  const toNext = travelTimeBetween(home, BUILDINGS[win.nextLocationId]);
  // Gap length minus both legs. Measured from `from`, which is normally where they are now.
  const minsAtHome = Math.round(win.durationMins - toHome.mins - toNext.mins);
  const worthIt = minsAtHome >= MIN_MINS_AT_HOME;
  // A "go home" pick is only allowed if at least one answer from this tool said yes.
  seen.homeWorthIt = seen.homeWorthIt || worthIt;
  return JSON.stringify({
    home: home.label,
    minsToHome: toHome.mins,
    modeToHome: toHome.mode,
    minsHomeToNextLecture: toNext.mins,
    modeHomeToNextLecture: toNext.mode,
    minsAtHome: Math.max(0, minsAtHome),
    timeAtHome: formatDuration(minsAtHome),
    worthIt,
    ...(worthIt
      ? {}
      : { advice: `Only ${formatDuration(minsAtHome)} at home after the round trip. Don't suggest going home.` }),
  });
}

/** "ECON0013 Econometrics (lecture)". Manual events usually have no module code. To-do blocks say "(to-do)". */
export const eventLabel = (e: TimetableEvent) =>
  `${[e.moduleCode, e.title].filter(Boolean).join(" ")} (${e.todoId ? "to-do" : e.kind})`;

/** Something the student added themselves (a society event, office hours, plans, a placed to-do), not a timetable class. */
export const isOwnPlan = (e: TimetableEvent) => Boolean((e.manualId && !e.fromClass) || e.todoId);
