// Checks for the student data the Today page sends with /api/recommend and /api/chat.
// Anything malformed is dropped rather than rejected: it's only extra context.

import { isLocation } from "../location";
import { isSlug } from "../societies/su-site";
import { isTodo, migrateTodo } from "../todos";
import type { Deadline, HomeLocation, Society, Todo } from "../types";

/** Each society costs a scrape, so cap how many we accept. */
const MAX_SOCIETIES = 10;
/** A safety cap on the request, not a working limit: the chat shows every open to-do. */
const MAX_TODOS = 100;
const MAX_ADDED_EVENTS = 100;

function isDeadline(x: unknown): x is Deadline {
  const d = x as Partial<Deadline> | null;
  return (
    typeof d?.id === "string" &&
    typeof d.moduleCode === "string" &&
    typeof d.title === "string" &&
    typeof d.due === "string" &&
    !Number.isNaN(Date.parse(d.due))
  );
}

function isSociety(x: unknown): x is Society {
  const s = x as Partial<Society> | null;
  return isSlug(s?.slug) && typeof s.name === "string";
}

/** London and the commuter belt. Our tube estimate means nothing further out, so we ignore it. */
function isHomeLocation(x: unknown): x is HomeLocation {
  const h = x as Partial<HomeLocation> | null;
  return (
    typeof h?.label === "string" &&
    h.label.length <= 60 &&
    typeof h.lat === "number" &&
    typeof h.lng === "number" &&
    h.lat > 51.0 &&
    h.lat < 52.2 &&
    h.lng > -1.2 &&
    h.lng < 0.8
  );
}

export interface StudentContext {
  /** The student's own deadlines. When sent, even empty, they replace the mock ones. */
  deadlines?: Deadline[];
  societies?: Society[];
  home?: HomeLocation;
  /** Open and repeating to-dos. */
  todos?: Todo[];
  /** Society event ids already on the student's calendar: fixed plans, never suggested again. */
  addedEventIds?: string[];
}

export function parseStudentContext(body: Record<string, unknown>): StudentContext {
  return {
    // A malformed location is dropped, not the whole deadline.
    deadlines: Array.isArray(body.deadlines)
      ? body.deadlines
          .filter(isDeadline)
          .map(({ location, ...d }) => (isLocation(location) ? { ...d, location } : d))
      : undefined,
    societies: Array.isArray(body.societies) ? body.societies.filter(isSociety).slice(0, MAX_SOCIETIES) : undefined,
    // A home outside the commuter belt is ignored (no home picks) rather than rejected.
    home: isHomeLocation(body.home) ? body.home : undefined,
    todos: Array.isArray(body.todos)
      ? body.todos.map(migrateTodo).filter(isTodo).filter((t) => !t.done || t.repeat).slice(0, MAX_TODOS)
      : undefined,
    addedEventIds: Array.isArray(body.addedEventIds)
      ? body.addedEventIds
          .filter((id): id is string => typeof id === "string" && id.length <= 200)
          .slice(0, MAX_ADDED_EVENTS)
      : undefined,
  };
}
