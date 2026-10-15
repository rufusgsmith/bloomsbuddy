// Shared domain types. Keep them flat and JSON-serialisable: they're stored in
// localStorage and sent to Claude in prompts.
//
// All timestamps are ISO 8601 strings WITH an explicit offset, in Europe/London time,
// e.g. "2026-10-16T10:00:00+01:00". See "Time rules" in CLAUDE.md.

import type { BuildingId, TravelMode } from "./buildings";

export type { BuildingId };

/** ISO 8601 timestamp with offset, e.g. "2026-10-16T10:00:00+01:00". */
export type IsoDateTime = string;

/** The kinds a timetable class can be (screenshots and the timetable editor). */
export type ClassKind = "lecture" | "seminar" | "lab" | "tutorial";
/** Every kind of event on the calendar: classes plus ones the student adds by hand. */
export type EventKind = ClassKind | "office-hours" | "society" | "personal";

export interface TimetableEvent {
  id: string;
  moduleCode: string; // e.g. "ECON0013". Empty for most manual events.
  title: string;
  kind: EventKind;
  start: IsoDateTime;
  end: IsoDateTime;
  /** Missing for manual events at a postcode or with no location. */
  buildingId?: BuildingId;
  /** A manual event somewhere that isn't a UCL building (from a postcode). */
  place?: { label: string; lat: number; lng: number };
  room: string; // e.g. "Roberts G06 Sir Ambrose Fleming LT". Can be empty.
  /** Set on events made from a ManualEvent: its id, so tapping opens it in the form. */
  manualId?: string;
  /** A one-day edit of a timetable class: still part of the timetable, so it keeps the timetable colour. */
  fromClass?: true;
  /** A to-do shown on the calendar as a block: its Todo.id. */
  todoId?: string;
}

/**
 * Free time between two timetable events on the same day. We skip time before the first
 * event and after the last one: we don't know where the student is then, so we can't
 * work out travel time.
 */
export interface Gap {
  id: string;
  start: IsoDateTime;
  end: IsoDateTime;
  durationMins: number;
  /** durationMins minus the trip to the next event (never below 0). */
  usableMins: number;
  /** Travel time from locationId to nextLocationId. */
  travelMins: number;
  /** How that trip is made: on foot, or by tube when walking is unrealistic. */
  travelMode: TravelMode;
  prevEvent: TimetableEvent;
  nextEvent: TimetableEvent;
  prevLocationId: BuildingId;
  nextLocationId: BuildingId;
  /** Where the student probably is at the start of the gap. */
  locationId: BuildingId;
  /** "inferred" comes from prevEvent's building, "manual" from the user's override. */
  locationSource: "inferred" | "manual";
}

export interface Deadline {
  id: string;
  moduleCode: string;
  title: string;
  due: IsoDateTime;
  /** Percentage of the module grade, if known. */
  weight?: number;
  source: "moodle" | "manual";
  estimatedHours?: number;
  /** Where the work has to happen (a lab, a studio), if anywhere in particular. */
  location?: EventLocation;
}

export interface SocietyEvent {
  id: string;
  society: string;
  title: string;
  start: IsoDateTime;
  end: IsoDateTime;
  venue: string;
  /** Set when the venue is a known UCL building (so we can compute travel time). */
  buildingId?: BuildingId;
  url?: string;
  /** Real events also carry one cost tag ("free-food", "free" or "paid") when the page states the cost. */
  tags: string[];
  /** true = free, false = paid. Missing when the page doesn't say. */
  free?: boolean;
  /** The page says you need to be a member to go. */
  membersOnly?: true;
  /** The page gives no end time: `end` is a guess (start + 1 hour) and mustn't be shown as fact. */
  endEstimated?: true;
  /** A repeating session with a day but no time ("Thursday evenings"). start/end span a rough window for partOfDay. */
  timeTBC?: true;
  partOfDay?: PartOfDay;
}

export type PartOfDay = "morning" | "afternoon" | "evening";

/** A UCL Students' Union club or society, e.g. { slug: "chess-society", name: "Chess Society" }. */
export interface Society {
  /** Path segment on studentsunionucl.org/clubs-societies/<slug>. */
  slug: string;
  name: string;
}

/** How busy a library usually is at a given time. An estimate, not a live count. */
export type BusynessLevel = "quiet" | "moderate" | "busy" | "packed";

export type RecommendationType = "study" | "event" | "rest" | "home" | "food";

export interface RecommendationOption {
  title: string;
  type: RecommendationType;
  /** Human-readable place, e.g. "SSEES Library". */
  place: string;
  /** Travel time from where the student is at the start of the gap. */
  travelMins: number;
  travelMode: TravelMode;
  /** Short, friendly reason in Bloomsbuddy's voice, citing real details. */
  reason: string;
  /** id of the related Deadline / SocietyEvent / library BuildingId / FoodSpot, if any. */
  relatedId?: string;
  /** Estimated busyness for study picks in a library (the same level Claude saw). */
  busyness?: BusynessLevel;
  /** id of the student's Todo this pick is about, if any. Works with any type. */
  todoId?: string;
}

export interface Recommendation {
  gapId: string;
  top: RecommendationOption;
  /** Exactly two alternatives. The tuple type enforces it. */
  alternatives: [RecommendationOption, RecommendationOption];
  generatedAt: IsoDateTime;
}

/**
 * Where the student lives, saved in localStorage on its own key (it works in the demo week too).
 * "none" = they chose "Don't use my home". No saved value at all = not set yet.
 */
export type Home =
  | { kind: "hall"; buildingId: BuildingId }
  | { kind: "private"; postcode: string; lat: number; lng: number }
  | { kind: "none" };

/** What the Today page sends to /api/recommend: just enough to measure trips home. */
export interface HomeLocation {
  label: string;
  lat: number;
  lng: number;
}

// ---- The student's own data (from onboarding), stored in localStorage ----

/** 1 = Monday … 7 = Sunday, same as dayOfWeek() in london-time.ts. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** How a to-do repeats. time and partOfDay are both optional, and the form only sets one of them. */
export interface TodoRepeat {
  freq: "daily" | "weekly" | "monthly";
  /** Weekly only: which days (at least one). */
  days?: Weekday[];
  /** Monthly only: 1–31. In shorter months, 29–31 fall on the month's last day. */
  dayOfMonth?: number;
  /** Preferred London wall-clock time, "HH:MM". */
  time?: WallTime;
  partOfDay?: PartOfDay;
}

/** One item on the To-do tab. Saved in localStorage on its own key (works in the demo week too). */
export interface Todo {
  id: string;
  title: string;
  /** How long the student reckons it takes, 1–720 minutes. */
  estMinutes?: number;
  /** London calendar day to get it done by. Never set together with repeat. */
  doBefore?: DateKey;
  repeat?: TodoRepeat;
  /**
   * For a repeating to-do, done means "done for this occurrence". It counts as open again once
   * the next occurrence after doneOn arrives (see isDoneNow in lib/todos.ts).
   */
  done: boolean;
  /** London day it was last ticked. Only kept for repeating to-dos. */
  doneOn?: DateKey;
  /** Where it has to be done (a shop, an office), if anywhere in particular. */
  location?: EventLocation;
  /**
   * Showing on the Today calendar. A to-do with a repeat time is shown on each occurrence unless
   * this is false. One without a time is shown only when given a slot (one day, one start time).
   */
  onToday?: false | TodoSlot;
}

/** Where an untimed to-do sits on the calendar. */
export interface TodoSlot {
  date: DateKey;
  time: WallTime;
}

/** "YYYY-MM-DD", a Europe/London calendar day. */
export type DateKey = string;
/** "HH:MM", 24-hour London wall-clock time. */
export type WallTime = string;

/**
 * One class in the student's weekly timetable pattern. Times are wall-clock, not ISO:
 * the pattern repeats across the BST→GMT switch, so a fixed offset would be wrong.
 */
export interface WeeklyClass {
  id: string;
  moduleCode: string;
  title: string;
  kind: ClassKind;
  /** 1 = Monday … 7 = Sunday. */
  dayOfWeek: number;
  startTime: WallTime;
  endTime: WallTime;
  room: string;
  buildingId: BuildingId;
  /** True when Claude couldn't match the room to a building, so the UI asks the student to check. */
  buildingGuessed?: boolean;
}

export interface UserData {
  version: 1;
  classes: WeeklyClass[];
  /** Monday of the first teaching week. */
  termStart: DateKey;
  /** How many weeks the pattern repeats for, e.g. 11 for a UCL term. */
  weeks: number;
  deadlines: Deadline[];
  /** Optional so data saved before societies existed still loads. */
  societies?: Society[];
  savedAt: IsoDateTime;
}

/** A place for a manual event, to-do or deadline: a UCL building, or anywhere else by postcode. */
export type EventLocation =
  | { kind: "building"; buildingId: BuildingId }
  | { kind: "postcode"; postcode: string; lat: number; lng: number };

/**
 * An event the student added by hand on Today (office hours, a society meet-up, plans), or a
 * one-off change to a single timetable class. Saved in localStorage on its own key, so it works
 * in the demo week too. Times are London wall-clock, like WeeklyClass.
 */
export interface ManualEvent {
  id: string;
  title: string;
  /** Kept when the event is an edited copy of a timetable class. */
  moduleCode?: string;
  /** An edited copy of one day of a timetable class (not something the student added). */
  fromClass?: true;
  /** Added from the Societies tab: the SocietyEvent.id it was copied from. */
  societyEventId?: string;
  kind: EventKind;
  /** The day it happens. When weekly, the first one: it repeats on that weekday from then on. */
  date: DateKey;
  startTime: WallTime;
  endTime: WallTime;
  room?: string;
  location?: EventLocation;
  weekly: boolean;
}

// ---- Chat (Today's chat assistant). Session-only: kept in sessionStorage, never in localStorage ----

/** Something Claude offers to add. Nothing is saved until the student taps Add. */
export type ChatProposal = { id: string; status?: "added" | "dismissed" } & (
  | { kind: "event"; event: Omit<ManualEvent, "id"> }
  | { kind: "todo"; todo: Omit<Todo, "id" | "done"> }
);

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Assistant only: cards to add an event or to-do. */
  proposals?: ChatProposal[];
}
