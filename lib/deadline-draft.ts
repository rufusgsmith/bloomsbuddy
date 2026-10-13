// Editing a Deadline in a form: the setup flow and the Deadlines tab share these.
// The form keeps date and time apart (London wall-clock) and turns them back into an ISO
// instant with the right offset on save. See "Time rules" in CLAUDE.md.

import { londonDateKey } from "./gaps";
import { addDays, isDateKey, isWallTime, londonIso, londonTodayKey } from "./london-time";
import type { Deadline } from "./types";

/** A deadline while it's being edited: date and time apart, weight as typed. */
export interface DraftDeadline {
  id: string;
  moduleCode: string;
  title: string;
  date: string;
  time: string;
  weight: string;
  source: Deadline["source"];
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
    date: addDays(londonTodayKey(), 7),
    time: "23:59",
    weight: "",
    source: "manual",
  };
}

export function toDraft(d: Deadline): DraftDeadline {
  return {
    id: d.id,
    moduleCode: d.moduleCode,
    title: d.title,
    date: londonDateKey(d.due),
    time: londonTime.format(new Date(d.due)),
    weight: d.weight === undefined ? "" : String(d.weight),
    source: d.source,
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
    ...(Number.isFinite(weight) ? { weight } : {}),
    source: d.source,
    ...(extra?.estimatedHours !== undefined ? { estimatedHours: extra.estimatedHours } : {}),
  };
}

export function deadlineProblem(d: DraftDeadline): string | null {
  if (!d.title.trim()) return "Give it a name";
  if (!isDateKey(d.date) || !isWallTime(d.time)) return "Needs a due date and time";
  return null;
}
