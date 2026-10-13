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

/**
 * Free time between two timetable events on the same day. We skip time before the first
 * event and after the last one: we don't know where the student is then, so we can't
 * work out walking time.
 */
export interface Gap {
  id: string;
  start: IsoDateTime;
  end: IsoDateTime;
  durationMins: number;
  /** durationMins minus the walk to the next event (never below 0). */
  usableMins: number;
  /** Walking time from locationId to nextLocationId. */
  walkMins: number;
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

export type RecommendationType = "study" | "event" | "rest";

export interface RecommendationOption {
  title: string;
  type: RecommendationType;
  /** Human-readable place, e.g. "SSEES Library". */
  place: string;
  /** Walking time from where the student is at the start of the gap. */
  walkMins: number;
  /** Short, friendly reason in Bloomsbuddy's voice, citing real details. */
  reason: string;
  /** id of the related Deadline / SocietyEvent / library BuildingId, if any. */
  relatedId?: string;
}

export interface Recommendation {
  gapId: string;
  top: RecommendationOption;
  /** Exactly two alternatives. The tuple type enforces it. */
  alternatives: [RecommendationOption, RecommendationOption];
  generatedAt: IsoDateTime;
}
