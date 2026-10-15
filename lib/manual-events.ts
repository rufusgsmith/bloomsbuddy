// Events the student adds by hand on Today, and one-off changes to single timetable classes.
// Saved in localStorage on their own key, apart from UserData, so they work in the demo week too.
// Same pattern as home.ts and todos.ts: anything unreadable is dropped rather than crashing.
//
// A change to one class (moved, renamed, cancelled) never touches the weekly pattern: that day's
// class is hidden, and an edited copy is saved as a one-off ManualEvent.

import { eventsOnDay, londonDateKey } from "./gaps";
import { dayOfWeek, isDateKey, isWallTime, londonIso, londonWeekdayAndMinutes } from "./london-time";
import {
  isLocation,
  locationDraftFrom,
  locationDraftProblem,
  locationFromDraft,
  type LocationDraft,
  type PostcodePlace,
} from "./location";
import type { DateKey, EventKind, EventLocation, ManualEvent, SocietyEvent, TimetableEvent, WallTime } from "./types";

const KEY = "bloomsbuddy:events";
/** Fired on this tab after we write. The "storage" event only reaches other tabs. */
const CHANGE_EVENT = "bloomsbuddy:events";

export const MAX_TITLE = 200;

export const EVENT_KINDS: { value: EventKind; label: string }[] = [
  { value: "lecture", label: "Lecture" },
  { value: "seminar", label: "Seminar" },
  { value: "lab", label: "Lab" },
  { value: "tutorial", label: "Tutorial" },
  { value: "office-hours", label: "Office hours" },
  { value: "society", label: "Society" },
  { value: "personal", label: "Personal" },
];

export interface EventStore {
  events: ManualEvent[];
  /** Timetable class occurrences the student removed or replaced, by occurrenceKey. */
  hidden: string[];
}

const EMPTY: EventStore = { events: [], hidden: [] };

// ---------- Storage ----------

export function readRawEvents(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const isKind = (k: unknown): k is EventKind => EVENT_KINDS.some((x) => x.value === k);

export function isManualEvent(x: unknown): x is ManualEvent {
  const m = x as Partial<ManualEvent> | null;
  return (
    typeof m?.id === "string" &&
    typeof m.title === "string" &&
    m.title.trim().length > 0 &&
    m.title.length <= MAX_TITLE &&
    isKind(m.kind) &&
    isDateKey(m.date) &&
    isWallTime(m.startTime) &&
    isWallTime(m.endTime) &&
    m.endTime > m.startTime &&
    typeof m.weekly === "boolean" &&
    (m.moduleCode === undefined || typeof m.moduleCode === "string") &&
    (m.fromClass === undefined || m.fromClass === true) &&
    (m.societyEventId === undefined || typeof m.societyEventId === "string") &&
    (m.room === undefined || typeof m.room === "string") &&
    (m.location === undefined || isLocation(m.location))
  );
}

export function parseEvents(raw: string | null): EventStore {
  if (!raw) return EMPTY;
  try {
    const s = JSON.parse(raw) as Partial<EventStore>;
    return {
      events: Array.isArray(s.events) ? s.events.filter(isManualEvent) : [],
      hidden: Array.isArray(s.hidden) ? s.hidden.filter((h): h is string => typeof h === "string") : [],
    };
  } catch {
    return EMPTY;
  }
}

/** Returns false if the browser refused to save. */
function saveEvents(store: EventStore): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeEvents(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const load = () => parseEvents(readRawEvents());

/** Adds a manual event, or replaces the one with the same id. */
export function saveManualEvent(m: ManualEvent): boolean {
  const s = load();
  return saveEvents({ ...s, events: [...s.events.filter((e) => e.id !== m.id), m] });
}

/** Deletes a manual event (every week of it, if it repeats). */
export function deleteManualEvent(id: string): boolean {
  const s = load();
  return saveEvents({ ...s, events: s.events.filter((e) => e.id !== id) });
}

/** Hides one day's timetable class and, when given, saves its edited copy in its place. */
export function replaceOccurrence(key: string, copy?: ManualEvent): boolean {
  const s = load();
  return saveEvents({
    hidden: s.hidden.includes(key) ? s.hidden : [...s.hidden, key],
    events: copy ? [...s.events.filter((e) => e.id !== copy.id), copy] : s.events,
  });
}

// ---------- Building a day ----------

/** Identifies one day's copy of a timetable class. User class ids already carry the week; demo ids don't. */
export const occurrenceKey = (e: TimetableEvent, dateKey: DateKey) => `${e.id}@${dateKey}`;

export function occursOn(m: ManualEvent, dateKey: DateKey): boolean {
  return m.weekly ? m.date <= dateKey && dayOfWeek(m.date) === dayOfWeek(dateKey) : m.date === dateKey;
}

/** A place as TimetableEvent fields: a building id, or a postcode's coordinates. */
export function locationFields(loc: EventLocation | undefined): Pick<TimetableEvent, "buildingId" | "place"> {
  if (loc?.kind === "building") return { buildingId: loc.buildingId };
  if (loc?.kind === "postcode") return { place: { label: loc.postcode, lat: loc.lat, lng: loc.lng } };
  return {};
}

function toTimetableEvent(m: ManualEvent, dateKey: DateKey): TimetableEvent {
  return {
    id: `${m.id}@${dateKey}`,
    manualId: m.id,
    ...(m.fromClass ? { fromClass: true as const } : {}),
    moduleCode: m.moduleCode ?? "",
    title: m.title,
    kind: m.kind,
    start: londonIso(dateKey, m.startTime),
    end: londonIso(dateKey, m.endTime),
    room: m.room ?? "",
    ...locationFields(m.location),
  };
}

/** A day's events: its timetable classes minus hidden ones, plus manual events that fall on it. */
export function eventsForDay(classes: TimetableEvent[], store: EventStore, dateKey: DateKey): TimetableEvent[] {
  const hidden = new Set(store.hidden);
  return [
    ...classes.filter((e) => !hidden.has(occurrenceKey(e, dateKey))),
    ...store.events.filter((m) => occursOn(m, dateKey)).map((m) => toTimetableEvent(m, dateKey)),
  ];
}

/** Same, from a whole timetable (any days): picks out that day's classes first. */
export const dayEventsFor = (timetable: TimetableEvent[], store: EventStore, dateKey: DateKey) =>
  eventsForDay(eventsOnDay(timetable, dateKey), store, dateKey);

// ---------- Society events ----------

/** The student's copy of a society event, if they've added it to their calendar. */
export const findSocietyAdd = (store: EventStore, societyEventId: string) =>
  store.events.find((m) => m.societyEventId === societyEventId);

/** A society event as a one-off manual event, linked back to it. Cut at midnight if it runs over. */
export function manualFromSociety(e: SocietyEvent, id: string): ManualEvent {
  const date = londonDateKey(e.start);
  const startMin = londonWeekdayAndMinutes(e.start).minutes;
  const endMin = londonDateKey(e.end) === date ? londonWeekdayAndMinutes(e.end).minutes : 24 * 60;
  return {
    id,
    title: e.title.slice(0, MAX_TITLE),
    societyEventId: e.id,
    kind: "society",
    date,
    startTime: wallTimeOf(startMin),
    endTime: wallTimeOf(Math.max(endMin, startMin + 1)),
    ...(e.venue ? { room: e.venue } : {}),
    ...(e.buildingId ? { location: { kind: "building" as const, buildingId: e.buildingId } } : {}),
    weekly: false,
  };
}

// ---------- The form ----------

/** What the event form edits. Every field is a plain string or flag, like the inputs. */
export interface EventDraft extends LocationDraft {
  title: string;
  moduleCode?: string;
  fromClass?: true;
  societyEventId?: string;
  kind: EventKind;
  date: DateKey;
  startTime: WallTime;
  endTime: WallTime;
  room: string;
  weekly: boolean;
}

/** HH:MM for minutes since midnight, capped at 23:59 so it stays a valid time. */
export function wallTimeOf(min: number): WallTime {
  const m = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** A new event on a day, from startMin, an hour long (cut at midnight). */
export function blankDraft(date: DateKey, startMin: number): EventDraft {
  return {
    title: "",
    kind: "personal",
    date,
    startTime: wallTimeOf(startMin),
    endTime: wallTimeOf(startMin + 60),
    room: "",
    ...locationDraftFrom(),
    weekly: false,
  };
}

export function draftFromManual(m: ManualEvent): EventDraft {
  return {
    title: m.title,
    moduleCode: m.moduleCode,
    ...(m.fromClass ? { fromClass: true as const } : {}),
    ...(m.societyEventId ? { societyEventId: m.societyEventId } : {}),
    kind: m.kind,
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    room: m.room ?? "",
    ...locationDraftFrom(m.location),
    weekly: m.weekly,
  };
}

/** One day's timetable class, ready to change just that day. */
export function draftFromClass(e: TimetableEvent, dateKey: DateKey): EventDraft {
  const mins = (iso: string) => londonWeekdayAndMinutes(iso).minutes;
  return {
    title: e.title,
    moduleCode: e.moduleCode || undefined,
    fromClass: true,
    kind: e.kind,
    date: dateKey,
    startTime: wallTimeOf(mins(e.start)),
    endTime: wallTimeOf(mins(e.end)),
    room: e.room,
    ...locationDraftFrom(e.buildingId ? { kind: "building", buildingId: e.buildingId } : undefined),
    weekly: false,
  };
}

/** The first problem with a draft, or null when it can be saved. Checked in code, no Claude. */
export function validateEventDraft(d: EventDraft): string | null {
  if (!d.title.trim()) return "Give it a title";
  if (d.title.length > MAX_TITLE) return `Keep the title under ${MAX_TITLE} characters`;
  if (!isDateKey(d.date)) return "Pick a date";
  if (!isWallTime(d.startTime) || !isWallTime(d.endTime)) return "Pick a start and end time";
  if (d.endTime <= d.startTime) return "End has to be after start";
  return locationDraftProblem(d);
}

/** A valid draft as a ManualEvent. The postcode's coordinates come from /api/postcode. */
export function eventFromDraft(
  id: string,
  d: EventDraft,
  postcodeLookup?: PostcodePlace,
): ManualEvent {
  const location = locationFromDraft(d, postcodeLookup);
  return {
    id,
    title: d.title.trim(),
    ...(d.moduleCode ? { moduleCode: d.moduleCode } : {}),
    ...(d.fromClass ? { fromClass: true as const } : {}),
    ...(d.societyEventId ? { societyEventId: d.societyEventId } : {}),
    kind: d.kind,
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime,
    ...(d.room.trim() ? { room: d.room.trim() } : {}),
    ...(location ? { location } : {}),
    weekly: d.weekly,
  };
}

/** Next half hour from a minute of the day, e.g. 615 (10:15) → 630. */
export const nextHalfHour = (min: number) => Math.ceil((min + 1) / 30) * 30;
