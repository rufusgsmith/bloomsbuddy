// Events the student adds by hand on Today, and one-off changes to single timetable classes.
// Saved in localStorage on their own key, apart from UserData, so they work in the demo week too.
// Same pattern as home.ts and todos.ts: anything unreadable is dropped rather than crashing.
//
// A change to one class (moved, renamed, cancelled) never touches the weekly pattern: that day's
// class is hidden, and an edited copy is saved as a one-off ManualEvent.

import { BUILDINGS, type BuildingId } from "./buildings";
import { dayOfWeek, isDateKey, isWallTime, londonIso, londonWeekdayAndMinutes } from "./london-time";
import { isPostcodeShape } from "./postcode";
import type { DateKey, EventKind, EventLocation, ManualEvent, TimetableEvent, WallTime } from "./types";

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

function isLocation(x: unknown): x is EventLocation {
  const l = x as Partial<Record<string, unknown>> | null;
  if (l?.kind === "building") return typeof l.buildingId === "string" && l.buildingId in BUILDINGS;
  return (
    l?.kind === "postcode" && typeof l.postcode === "string" && Number.isFinite(l.lat) && Number.isFinite(l.lng)
  );
}

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

function toTimetableEvent(m: ManualEvent, dateKey: DateKey): TimetableEvent {
  const loc = m.location;
  return {
    id: `${m.id}@${dateKey}`,
    manualId: m.id,
    moduleCode: m.moduleCode ?? "",
    title: m.title,
    kind: m.kind,
    start: londonIso(dateKey, m.startTime),
    end: londonIso(dateKey, m.endTime),
    room: m.room ?? "",
    ...(loc?.kind === "building" ? { buildingId: loc.buildingId } : {}),
    ...(loc?.kind === "postcode" ? { place: { label: loc.postcode, lat: loc.lat, lng: loc.lng } } : {}),
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

// ---------- The form ----------

export type LocationChoice = "none" | "building" | "postcode";

/** What the event form edits. Every field is a plain string or flag, like the inputs. */
export interface EventDraft {
  title: string;
  moduleCode?: string;
  kind: EventKind;
  date: DateKey;
  startTime: WallTime;
  endTime: WallTime;
  room: string;
  locationChoice: LocationChoice;
  buildingId: BuildingId;
  postcode: string;
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
    locationChoice: "none",
    buildingId: "main-building",
    postcode: "",
    weekly: false,
  };
}

export function draftFromManual(m: ManualEvent): EventDraft {
  return {
    title: m.title,
    moduleCode: m.moduleCode,
    kind: m.kind,
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    room: m.room ?? "",
    locationChoice: m.location?.kind ?? "none",
    buildingId: m.location?.kind === "building" ? m.location.buildingId : "main-building",
    postcode: m.location?.kind === "postcode" ? m.location.postcode : "",
    weekly: m.weekly,
  };
}

/** One day's timetable class, ready to change just that day. */
export function draftFromClass(e: TimetableEvent, dateKey: DateKey): EventDraft {
  const mins = (iso: string) => londonWeekdayAndMinutes(iso).minutes;
  return {
    title: e.title,
    moduleCode: e.moduleCode || undefined,
    kind: e.kind,
    date: dateKey,
    startTime: wallTimeOf(mins(e.start)),
    endTime: wallTimeOf(mins(e.end)),
    room: e.room,
    locationChoice: e.buildingId ? "building" : "none",
    buildingId: e.buildingId ?? "main-building",
    postcode: "",
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
  if (d.locationChoice === "postcode" && !isPostcodeShape(d.postcode)) {
    return "That doesn't look like a UK postcode (e.g. WC1E 6BT)";
  }
  return null;
}

/** A valid draft as a ManualEvent. The postcode's coordinates come from /api/postcode. */
export function eventFromDraft(
  id: string,
  d: EventDraft,
  postcodeLookup?: { postcode: string; lat: number; lng: number },
): ManualEvent {
  const location: EventLocation | undefined =
    d.locationChoice === "building"
      ? { kind: "building", buildingId: d.buildingId }
      : d.locationChoice === "postcode" && postcodeLookup
        ? { kind: "postcode", ...postcodeLookup }
        : undefined;
  return {
    id,
    title: d.title.trim(),
    ...(d.moduleCode ? { moduleCode: d.moduleCode } : {}),
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
