// To-dos and deadlines on the Today calendar.
// A to-do with a repeat time shows as a block on each occurrence (unless turned off), and one
// without a time shows only where the student placed it. Blocks are busy time, like events.
// Deadlines the student adds to the calendar ("Add to calendar" on the Deadlines tab) show as thin
// flags at their due time: not blocks, not busy time. Their ids are kept on their own localStorage
// key, so it works in the demo week too.

import { londonDateKey } from "./gaps";
import { londonIso, londonWeekdayAndMinutes } from "./london-time";
import { locationFields, wallTimeOf } from "./manual-events";
import { isDoneNow, occursOn } from "./todos";
import type { DateKey, Deadline, TimetableEvent, Todo, TodoSlot, WallTime } from "./types";

/** A to-do with no estimate gets a block this long. */
export const TODO_DEFAULT_MINS = 30;

const KEY = "bloomsbuddy:calendar-deadlines";
/** Fired on this tab after we write. The "storage" event only reaches other tabs. */
const CHANGE_EVENT = "bloomsbuddy:calendar-deadlines";

// ---------- To-dos ----------

/** Has a repeat time, so it places itself. */
export const isTimed = (t: Todo) => !!t.repeat?.time;

/** Whether the to-do is set to show on the calendar at all. */
export const isOnToday = (t: Todo) => (isTimed(t) ? t.onToday !== false : !!t.onToday);

/** Turns "Show on Today" off, or on (an untimed to-do needs a slot for that). */
export function setOnToday(t: Todo, on: boolean, slot?: TodoSlot): Todo {
  const { onToday: _drop, ...rest } = t;
  void _drop;
  if (isTimed(t)) return on ? rest : { ...rest, onToday: false };
  return on && slot ? { ...rest, onToday: slot } : rest;
}

/** When the to-do starts on this day, if it's on the calendar then. */
function startOn(t: Todo, dateKey: DateKey): WallTime | null {
  if (isDoneNow(t, dateKey)) return null;
  if (t.repeat?.time) return t.onToday !== false && occursOn(t.repeat, dateKey) ? t.repeat.time : null;
  return t.onToday && t.onToday.date === dateKey ? t.onToday.time : null;
}

/** The day's to-do blocks, as events (so gaps, clashes and the chat treat them as busy time). */
export function todoBlocksOn(todos: Todo[], dateKey: DateKey): TimetableEvent[] {
  return todos.flatMap((t) => {
    const time = startOn(t, dateKey);
    if (!time) return [];
    const start = londonIso(dateKey, time);
    const startMin = londonWeekdayAndMinutes(start).minutes;
    // Cut at the end of the day, like society events added to the calendar.
    const endMin = Math.max(startMin + 1, Math.min(startMin + (t.estMinutes ?? TODO_DEFAULT_MINS), 23 * 60 + 59));
    return [
      {
        id: `todo-${t.id}@${dateKey}`,
        todoId: t.id,
        moduleCode: "",
        title: t.title,
        kind: "personal" as const,
        start,
        end: londonIso(dateKey, wallTimeOf(endMin)),
        room: "",
        ...locationFields(t.location),
      },
    ];
  });
}

/**
 * Everything about to-dos that changes the calendar, as one string. Today remounts when it
 * changes (cached picks are for the old gaps), but not when an unplaced to-do is ticked.
 */
export function calendarKey(todos: Todo[], today: DateKey): string {
  return JSON.stringify(
    todos
      .filter(isOnToday)
      .map((t) => [t.id, t.onToday, t.repeat, t.estMinutes, t.location, isDoneNow(t, today), t.doneOn]),
  );
}

// ---------- Deadlines ----------

/** Deadlines due on this London day that the student added to the calendar. */
export const deadlinesOn = (deadlines: Deadline[], added: string[], dateKey: DateKey) =>
  deadlines.filter((d) => londonDateKey(d.due) === dateKey && added.includes(d.id));

export function readRawCalendarDeadlines(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseDeadlineIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Adds a deadline's flag to the calendar, or takes it off. Returns false if the browser refused to save. */
export function setDeadlineOnCalendar(id: string, on: boolean): boolean {
  const rest = parseDeadlineIds(readRawCalendarDeadlines()).filter((x) => x !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(on ? [...rest, id] : rest));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeCalendarDeadlines(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
