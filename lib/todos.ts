// The student's to-do list in localStorage. Kept apart from UserData so it works in the demo
// week too. Same pattern as home.ts: anything unreadable is dropped rather than crashing.

import { isDateKey } from "./london-time";
import type { Todo } from "./types";

const KEY = "bloomsbuddy:todos";
/** Fired on this tab after we write. The "storage" event only reaches other tabs. */
const CHANGE_EVENT = "bloomsbuddy:todos";

/** The time-estimate chips on the To-do tab. */
export const EST_CHIPS = [15, 30, 60, 90] as const;
/** Longest title we keep (and the most /api/recommend accepts). */
export const MAX_TITLE = 200;
/** Longest estimate we accept, in minutes. */
export const MAX_EST_MINS = 600;

/** Shape check shared by the client and /api/recommend. */
export function isTodo(x: unknown): x is Todo {
  const t = x as Partial<Todo> | null;
  return (
    typeof t?.id === "string" &&
    typeof t.title === "string" &&
    t.title.trim().length > 0 &&
    t.title.length <= MAX_TITLE &&
    typeof t.done === "boolean" &&
    (t.due === undefined || isDateKey(t.due)) &&
    (t.estMinutes === undefined ||
      (Number.isInteger(t.estMinutes) && t.estMinutes > 0 && t.estMinutes <= MAX_EST_MINS))
  );
}

export function readRawTodos(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseTodos(raw: string | null): Todo[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter(isTodo) : [];
  } catch {
    return [];
  }
}

/** Returns false if the browser refused to save. */
export function saveTodos(todos: Todo[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(todos));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeTodos(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Open to-dos first by due day (undated last), then by estimate (quickest first). */
export function byDueThenEstimate(a: Todo, b: Todo): number {
  const dueA = a.due ?? "9999-12-31";
  const dueB = b.due ?? "9999-12-31";
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  return (a.estMinutes ?? MAX_EST_MINS + 1) - (b.estMinutes ?? MAX_EST_MINS + 1);
}
