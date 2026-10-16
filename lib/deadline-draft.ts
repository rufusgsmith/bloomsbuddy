// Editing a Deadline in a form: the setup flow and the Deadlines tab share these.
// The form keeps date and time apart (London wall-clock) and turns them back into an ISO
// instant with the right offset on save. See "Time rules" in CLAUDE.md.

import { londonDateKey } from "./gaps";
import { addDays, isDateKey, isWallTime, londonIso, londonTodayKey } from "./london-time";
import { locationDraftFrom, locationDraftProblem, type LocationDraft } from "./location";
import type { Deadline, EventLocation } from "./types";

/**
 * A deadline while it's being edited: date and time apart, weight as typed. The picker edits the
 * LocationDraft fields; `location` is the saved place, kept as-is by forms without a picker (setup).
 */
export interface DraftDeadline extends LocationDraft {
  id: string;
  moduleCode: string;
  title: string;
  exam: boolean;
  date: string;
  /** Due time, or an exam's start time. */
  time: string;
  /** An exam's end time, same day. "" = not given. */
  endTime: string;
  weight: string;
  source: Deadline["source"];
  location?: EventLocation;
}

const londonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** A blank hand-added deadline, due a week from today at 23:59. */
export function blankDraft(): DraftDeadline {
  return {
    id: newId("dl"),
    moduleCode: "",
    title: "",
    exam: false,
    date: addDays(londonTodayKey(), 7),
    time: "23:59",
    endTime: "",
    weight: "",
    source: "manual",
    ...locationDraftFrom(),
  };
}

export function toDraft(d: Deadline): DraftDeadline {
  return {
    id: d.id,
    moduleCode: d.moduleCode,
    title: d.title,
    exam: !!d.exam,
    date: londonDateKey(d.due),
    time: londonTime.format(new Date(d.due)),
    endTime: d.exam && d.end ? londonTime.format(new Date(d.end)) : "",
    weight: d.weight === undefined ? "" : String(d.weight),
    source: d.source,
    ...locationDraftFrom(d.location),
    ...(d.location ? { location: d.location } : {}),
  };
}

/** `extra` keeps fields the form doesn't edit (e.g. estimatedHours) when editing an existing deadline. */
export function fromDraft(d: DraftDeadline, extra?: Pick<Deadline, "estimatedHours">): Deadline {
  const weight = Number.parseFloat(d.weight);
  return {
    id: d.id,
    moduleCode: d.moduleCode.trim().toUpperCase(),
    title: d.title.trim(),
    due: londonIso(d.date, d.time),
    ...(d.exam ? { exam: true as const } : {}),
    ...(d.exam && d.endTime ? { end: londonIso(d.date, d.endTime) } : {}),
    ...(Number.isFinite(weight) ? { weight } : {}),
    source: d.source,
    ...(extra?.estimatedHours !== undefined ? { estimatedHours: extra.estimatedHours } : {}),
    ...(d.location ? { location: d.location } : {}),
  };
}

export function deadlineProblem(d: DraftDeadline): string | null {
  if (!d.title.trim()) return "Give it a name";
  if (!isDateKey(d.date) || !isWallTime(d.time)) return d.exam ? "Needs a date and start time" : "Needs a due date and time";
  if (d.exam && d.endTime) {
    if (!isWallTime(d.endTime)) return "End time doesn't look right";
    if (d.endTime <= d.time) return "It has to end after it starts";
  }
  return locationDraftProblem(d);
}
