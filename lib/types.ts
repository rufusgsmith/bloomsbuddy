// Shared domain types. Keep them flat and JSON-serialisable: they're stored in
// localStorage and sent to Claude in prompts.
//
// All timestamps are ISO 8601 strings WITH an explicit offset, in Europe/London time,
// e.g. "2026-10-16T10:00:00+01:00". See "Time rules" in CLAUDE.md.

import type { BuildingId } from "./buildings";

export type { BuildingId };

/** ISO 8601 timestamp with offset, e.g. "2026-10-16T10:00:00+01:00". */
export type IsoDateTime = string;

export interface TimetableEvent {
  id: string;
  moduleCode: string; // e.g. "ECON0013"
  title: string;
  kind: "lecture" | "seminar" | "lab" | "tutorial";
  start: IsoDateTime;
  end: IsoDateTime;
  buildingId: BuildingId;
  room: string; // e.g. "Roberts G06 Sir Ambrose Fleming LT"
}

/** Free time between two timetable events (or before/after the day's first/last one). */
export interface Gap {
  id: string;
  start: IsoDateTime;
  end: IsoDateTime;
  durationMins: number;
  prevEvent?: TimetableEvent;
  nextEvent?: TimetableEvent;
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
}

export interface SocietyEvent {
  id: string;
  society: string;
  title: string;
  start: IsoDateTime;
  end: IsoDateTime;
  venue: string;
  /** Set when the venue is a known UCL building (so we can compute walking time). */
  buildingId?: BuildingId;
  url?: string;
  tags: string[];
  free: boolean;
}

export interface SeatAvailability {
  libraryId: BuildingId;
  name: string;
  available: number;
  total: number;
  updatedAt: IsoDateTime;
}

export type ActivityKind = "study" | "deadline" | "society" | "food" | "rest" | "explore";

export interface RecommendationOption {
  title: string;
  activity: ActivityKind;
  /** Short, friendly reason in Bloomsbuddy's voice. */
  reason: string;
  locationId?: BuildingId;
  walkMins?: number;
  /** id of the related Deadline / SocietyEvent / SeatAvailability, if any. */
  relatedId?: string;
}

export interface Recommendation {
  gapId: string;
  top: RecommendationOption;
  /** Exactly two alternatives. The tuple type enforces it. */
  alternatives: [RecommendationOption, RecommendationOption];
  generatedAt: IsoDateTime;
}
